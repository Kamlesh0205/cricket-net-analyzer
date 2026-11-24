// visionTracker.js
class VisionTracker {
    constructor(videoEl, overlayCanvas, onShotDetected) {
        this.video = videoEl;
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
        this.onShotDetected = onShotDetected;

        this.isRunning = false;
        this.prevFrame = null;
        this.ballHistory = []; // Stores { x, y, t }
        this.cooldown = false;
        this.ballColor = 'tennis'; // 'tennis' | 'red' | 'white'
        this.pixelsPerMeter = 45;  // Calibrated via pitch reference box
    }

    async startCamera() {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 60 }
            }
        });
        this.video.srcObject = stream;
        await this.video.play();

        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 480;
        this.isRunning = true;
        this.processLoop();
    }

    stopCamera() {
        this.isRunning = false;
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(t => t.stop());
        }
    }

    setBallType(type) {
        this.ballColor = type;
    }

    matchesBallColor(r, g, b) {
        if (this.ballColor === 'tennis') {
            // Neon yellow/green tennis ball
            return r > 150 && g > 170 && b < 110;
        } else if (this.ballColor === 'red') {
            // Red leather cricket ball
            return r > 130 && g < 75 && b < 75;
        } else {
            // White ball
            return r > 200 && g > 200 && b > 200;
        }
    }

    processLoop() {
        if (!this.isRunning) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.drawImage(this.video, 0, 0, w, h);

        const frame = this.ctx.getImageData(0, 0, w, h);
        const data = frame.data;

        // Draw calibration pitch zone guide (bottom-center hitting zone)
        this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(w * 0.25, h * 0.45, w * 0.5, h * 0.45);

        if (this.prevFrame && !this.cooldown) {
            let sumX = 0, sumY = 0, count = 0;

            // Step by 2 pixels for fast 60fps mobile execution
            for (let y = 0; y < h; y += 2) {
                for (let x = 0; x < w; x += 2) {
                    const i = (y * w + x) * 4;
                    const diff = Math.abs(data[i] - this.prevFrame[i]) +
                                 Math.abs(data[i + 1] - this.prevFrame[i + 1]) +
                                 Math.abs(data[i + 2] - this.prevFrame[i + 2]);

                    // Moving object + matches selected cricket ball color
                    if (diff > 65 && this.matchesBallColor(data[i], data[i + 1], data[i + 2])) {
                        sumX += x;
                        sumY += y;
                        count++;
                    }
                }
            }

            if (count > 8 && count < 1500) {
                const cx = sumX / count;
                const cy = sumY / count;
                const now = performance.now();

                // Draw live tracking reticle
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, 12, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#ff3b30';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();

                this.trackVector(cx, cy, now);
            }
        }

        this.prevFrame = new Uint8ClampedArray(data);
        requestAnimationFrame(() => this.processLoop());
    }

    trackVector(x, y, t) {
        this.ballHistory.push({ x, y, t });
        if (this.ballHistory.length > 8) this.ballHistory.shift();

        if (this.ballHistory.length >= 4) {
            const p1 = this.ballHistory[this.ballHistory.length - 4];
            const p2 = this.ballHistory[this.ballHistory.length - 3];
            const p3 = this.ballHistory[this.ballHistory.length - 2];
            const p4 = this.ballHistory[this.ballHistory.length - 1];

            // Incoming delivery moves DOWN the frame (vy > 0). Shot off bat moves UP (vy < 0).
            const vyIncoming = (p2.y - p1.y);
            const vyOutgoing = (p4.y - p3.y);

            if (vyIncoming > 4 && vyOutgoing < -8) {
                const dt = (p4.t - p3.t) / 1000 || 0.016;
                const dx = p4.x - p3.x;
                const dy = p3.y - p4.y; // upward pixel travel

                const pixelSpeed = Math.hypot(dx, dy) / dt;
                // Map pixel speed to realistic bat exit velocity (18 m/s to 40 m/s)
                const speedMs = Math.min(40, Math.max(18, (pixelSpeed / this.pixelsPerMeter) * 1.4));

                // Horizontal angle (-90 deg = leg side / left, +90 deg = off side / right)
                const azimuthDeg = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);

                // Elevation angle inferred from vertical upward velocity ratio
                const elevationDeg = Math.min(55, Math.max(4, Math.round((dy / (Math.abs(dx) + dy + 1)) * 42)));

                this.triggerCooldown();
                this.onShotDetected({ speedMs: Math.round(speedMs * 10) / 10, azimuthDeg, elevationDeg });
            }
        }
    }

    triggerCooldown() {
        this.cooldown = true;
        this.ballHistory = [];
        setTimeout(() => { this.cooldown = false; }, 2500); // 2.5s pause between deliveries
    }
}