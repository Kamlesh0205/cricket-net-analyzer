// visionTracker.js
class VisionTracker {
    constructor(videoEl, overlayCanvas, onShotDetected) {
        this.video = videoEl;
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
        this.onShotDetected = onShotDetected;

        this.isRunning = false;
        this.prevFrame = null;
        this.ballHistory = [];
        this.cooldown = false;
        this.ballColor = 'tennis'; // 'tennis' | 'red' | 'white' | 'custom'
        this.customHSV = null;
        this.pixelsPerMeter = 45;

        // Allow user to tap the ball on camera feed to lock its exact color
        this.canvas.addEventListener('pointerdown', (e) => {
            if (!this.isRunning) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) * (this.canvas.width / rect.width));
            const y = Math.floor((e.clientY - rect.top) * (this.canvas.height / rect.height));
            const pixel = this.ctx.getImageData(x, y, 1, 1).data;
            this.customHSV = this.rgbToHsv(pixel[0], pixel[1], pixel[2]);
            this.ballColor = 'custom';
            alert(`Locked onto ball color! Hue: ${Math.round(this.customHSV.h)}°`);
        });
    }

    async startCamera() {
        if (this.isRunning) return;
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
        this.prevFrame = null;
        this.ballHistory = [];
        this.isRunning = true;
        this.processLoop();
    }

    stopCamera() {
        this.isRunning = false;
        this.ballHistory = [];
        this.prevFrame = null;
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(t => t.stop());
            this.video.srcObject = null;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    setBallType(type) {
        this.ballColor = type;
    }

    rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;

        if (max !== min) {
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return { h, s, v };
    }

    matchesBallColor(r, g, b) {
        const { h, s, v } = this.rgbToHsv(r, g, b);

        if (this.ballColor === 'custom' && this.customHSV) {
            const hueDiff = Math.min(Math.abs(h - this.customHSV.h), 360 - Math.abs(h - this.customHSV.h));
            return hueDiff < 22 && s > 0.25 && v > 0.25;
        }
        if (this.ballColor === 'tennis') {
            // Yellow-Green Neon Tennis Ball (Hue 45° to 95°)
            return h >= 42 && h <= 98 && s > 0.35 && v > 0.35;
        }
        if (this.ballColor === 'red') {
            // Red Leather Ball (Hue 340°..360° or 0°..20°)
            return (h <= 20 || h >= 340) && s > 0.40 && v > 0.25;
        }
        // White Ball (Low saturation, high brightness)
        return s < 0.22 && v > 0.78;
    }

    processLoop() {
        if (!this.isRunning) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.drawImage(this.video, 0, 0, w, h);

        const frame = this.ctx.getImageData(0, 0, w, h);
        const data = frame.data;

        // Define Batting Crease Zone (bottom-center where batsman stands)
        const batZone = { xMin: w * 0.25, xMax: w * 0.75, yMin: h * 0.45, yMax: h * 0.92 };
        this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(batZone.xMin, batZone.yMin, batZone.xMax - batZone.xMin, batZone.yMax - batZone.yMin);

        if (this.prevFrame && !this.cooldown) {
            let ballSumX = 0, ballSumY = 0, ballPixels = 0;
            let batMinX = w, batMaxX = 0, batMinY = h, batMaxY = 0, batMotionPixels = 0;

            for (let y = 0; y < h; y += 2) {
                for (let x = 0; x < w; x += 2) {
                    const i = (y * w + x) * 4;
                    const diff = Math.abs(data[i] - this.prevFrame[i]) +
                                 Math.abs(data[i + 1] - this.prevFrame[i + 1]) +
                                 Math.abs(data[i + 2] - this.prevFrame[i + 2]);

                    if (diff > 75) {
                        // 1. Track Ball Pixels (moving + matches ball HSV color)
                        if (this.matchesBallColor(data[i], data[i + 1], data[i + 2])) {
                            ballSumX += x;
                            ballSumY += y;
                            ballPixels++;
                        }
                        // 2. Track Batsman Motion inside the Batting Crease Zone
                        else if (x >= batZone.xMin && x <= batZone.xMax && y >= batZone.yMin && y <= batZone.yMax) {
                            batMotionPixels++;
                            if (x < batMinX) batMinX = x;
                            if (x > batMaxX) batMaxX = x;
                            if (y < batMinY) batMinY = y;
                            if (y > batMaxY) batMaxY = y;
                        }
                    }
                }
            }

            // Draw Batsman Tracking Box when batsman moves/swings
            if (batMotionPixels > 80) {
                this.ctx.strokeStyle = '#facc15';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(batMinX, batMinY, batMaxX - batMinX, batMaxY - batMinY);
                this.ctx.fillStyle = '#facc15';
                this.ctx.font = '12px sans-serif';
                this.ctx.fillText('BATSMAN', batMinX, Math.max(14, batMinY - 4));
            }

            // Draw Ball Reticle only for compact ball-sized blobs (prevents net/background false triggers)
            if (ballPixels >= 10 && ballPixels <= 500) {
                const cx = ballSumX / ballPixels;
                const cy = ballSumY / ballPixels;
                const now = performance.now();

                this.ctx.beginPath();
                this.ctx.arc(cx, cy, 12, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#ef4444';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();

                this.trackVector(cx, cy, now, batMotionPixels > 40);
            } else if (this.ballHistory.length > 0 && performance.now() - this.ballHistory[this.ballHistory.length - 1].t > 350) {
                // Clear stale tracking points if ball disappears for >350ms
                this.ballHistory = [];
            }
        }

        // Draw Ball Trail
        if (this.ballHistory.length > 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.ballHistory[0].x, this.ballHistory[0].y);
            for (let k = 1; k < this.ballHistory.length; k++) {
                this.ctx.lineTo(this.ballHistory[k].x, this.ballHistory[k].y);
            }
            this.ctx.strokeStyle = '#38bdf8';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        this.prevFrame = new Uint8ClampedArray(data);
        requestAnimationFrame(() => this.processLoop());
    }

    trackVector(x, y, t, batsmanActive) {
        this.ballHistory.push({ x, y, t });
        if (this.ballHistory.length > 10) this.ballHistory.shift();

        // Require at least 5 consecutive tracked points so random noise NEVER triggers runs
        if (this.ballHistory.length >= 5) {
            const p1 = this.ballHistory[this.ballHistory.length - 5];
            const p2 = this.ballHistory[this.ballHistory.length - 3];
            const p3 = this.ballHistory[this.ballHistory.length - 2];
            const p4 = this.ballHistory[this.ballHistory.length - 1];

            // Delivery comes DOWN towards batsman (vyIncoming > 6 px/frame)
            // Shot leaves UP/OUT off the bat (vyOutgoing < -10 px/frame)
            const vyIncoming = p2.y - p1.y;
            const vyOutgoing = p4.y - p3.y;

            if (vyIncoming > 6 && vyOutgoing < -10 && batsmanActive) {
                const dt = Math.max(0.016, (p4.t - p3.t) / 1000);
                const dx = p4.x - p3.x;
                const dy = p3.y - p4.y;

                const pixelSpeed = Math.hypot(dx, dy) / dt;
                const speedMs = Math.min(40, Math.max(18, (pixelSpeed / this.pixelsPerMeter) * 1.35));
                const azimuthDeg = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
                const elevationDeg = Math.min(55, Math.max(5, Math.round((dy / (Math.abs(dx) + dy + 1)) * 42)));

                this.triggerCooldown();
                this.onShotDetected({
                    speedMs: Math.round(speedMs * 10) / 10,
                    azimuthDeg,
                    elevationDeg
                });
            }
        }
    }

    triggerCooldown() {
        this.cooldown = true;
        this.ballHistory = [];
        setTimeout(() => { this.cooldown = false; }, 3000);
    }
}