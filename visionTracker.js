// visionTracker.js
class VisionTracker {
    constructor(videoEl, overlayCanvas, onShotDetected) {
        this.video = videoEl;
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');
        this.onShotDetected = onShotDetected;

        // Offscreen fast processing canvas (160x120 = 16x faster 60fps mobile tracking)
        this.procCanvas = document.createElement('canvas');
        this.procCanvas.width = 160;
        this.procCanvas.height = 120;
        this.procCtx = this.procCanvas.getContext('2d', { willReadFrequently: true });

        this.isRunning = false;
        this.prevData = null;
        this.trail = []; // Stores { x, y, t } in normalized 0..1 coordinates
        this.cooldownUntil = 0;
        this.ballColor = 'any';
        this.customHSV = null;
        this.statusText = 'CAMERA OFF';

        // Tap anywhere on the live video to lock onto the exact ball color
        this.canvas.addEventListener('pointerdown', (e) => {
            if (!this.isRunning) return;
            const rect = this.canvas.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;

            const px = Math.min(159, Math.max(0, Math.floor(nx * 160)));
            const py = Math.min(119, Math.max(0, Math.floor(ny * 120)));

            // Sample a 3x3 patch around tap for accurate color lock
            const patch = this.procCtx.getImageData(Math.max(0, px - 1), Math.max(0, py - 1), 3, 3).data;
            let r = 0, g = 0, b = 0, n = patch.length / 4;
            for (let i = 0; i < patch.length; i += 4) {
                r += patch[i]; g += patch[i + 1]; b += patch[i + 2];
            }
            this.customHSV = this.rgbToHsv(r / n, g / n, b / n);
            this.ballColor = 'custom';
            this.statusText = `LOCKED CUSTOM BALL (H:${Math.round(this.customHSV.h)}°)`;
        });
    }

    async startCamera() {
        if (this.isRunning) return;
        try {
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
            this.prevData = null;
            this.trail = [];
            this.isRunning = true;
            this.statusText = 'SCANNING — TAP BALL TO LOCK COLOR';
            this.loop();
        } catch (err) {
            alert('Camera Error: ' + err.message + '. Ensure HTTPS and camera permission are allowed.');
        }
    }

    stopCamera() {
        this.isRunning = false;
        this.trail = [];
        this.prevData = null;
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(t => t.stop());
            this.video.srcObject = null;
        }
    }

    setBallType(type) {
        this.ballColor = type;
        this.statusText = `MODE: ${type.toUpperCase()} BALL`;
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

    isBallPixel(r, g, b) {
        if (this.ballColor === 'any') return true;
        const { h, s, v } = this.rgbToHsv(r, g, b);

        if (this.ballColor === 'custom' && this.customHSV) {
            const dh = Math.min(Math.abs(h - this.customHSV.h), 360 - Math.abs(h - this.customHSV.h));
            return dh < 28 && s > 0.20 && v > 0.20;
        }
        if (this.ballColor === 'tennis') {
            // Broad fluorescent yellow/green range for indoor & outdoor light
            return h >= 38 && h <= 105 && s > 0.28 && v > 0.30;
        }
        if (this.ballColor === 'red') {
            // Red/Maroon cricket ball
            return (h <= 25 || h >= 335) && s > 0.32 && v > 0.20;
        }
        // White ball
        return s < 0.25 && v > 0.72;
    }

    loop() {
        if (!this.isRunning) return;

        const cw = this.canvas.width;
        const ch = this.canvas.height;

        // 1. Draw full-res video to visible canvas
        this.ctx.drawImage(this.video, 0, 0, cw, ch);

        // 2. Draw downsampled 160x120 frame for ultra-fast pixel analysis
        this.procCtx.drawImage(this.video, 0, 0, 160, 120);
        const currData = this.procCtx.getImageData(0, 0, 160, 120).data;

        const now = performance.now();

        if (this.prevData && now > this.cooldownUntil) {
            let sumX = 0, sumY = 0, count = 0;

            for (let y = 0; y < 120; y++) {
                for (let x = 0; x < 160; x++) {
                    const idx = (y * 160 + x) * 4;
                    const motion = Math.abs(currData[idx] - this.prevData[idx]) +
                                   Math.abs(currData[idx + 1] - this.prevData[idx + 1]) +
                                   Math.abs(currData[idx + 2] - this.prevData[idx + 2]);

                    // Lower motion threshold (45) catches fast small balls even with motion blur
                    if (motion > 45 && this.isBallPixel(currData[idx], currData[idx + 1], currData[idx + 2])) {
                        sumX += x;
                        sumY += y;
                        count++;
                    }
                }
            }

            // On 160x120 grid, a ball is 3 to 180 pixels
            if (count >= 3 && count <= 180) {
                const nx = (sumX / count) / 160;
                const ny = (sumY / count) / 120;

                // Filter out teleporting noise jumps (> 35% of screen in 1 frame)
                const last = this.trail[this.trail.length - 1];
                if (!last || Math.hypot(nx - last.x, ny - last.y) < 0.35) {
                    this.trail.push({ x: nx, y: ny, t: now });
                    if (this.trail.length > 12) this.trail.shift();
                    this.statusText = `TRACKING BALL (${count} px)`;
                    this.analyzeTrajectory();
                }
            } else if (this.trail.length > 0 && now - this.trail[this.trail.length - 1].t > 300) {
                this.trail = [];
                this.statusText = 'SCANNING — READY FOR DELIVERY';
            }
        }

        // Draw live ball trail & target reticle on main canvas
        if (this.trail.length > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.trail[0].x * cw, this.trail[0].y * ch);
            for (let i = 1; i < this.trail.length; i++) {
                this.ctx.lineTo(this.trail[i].x * cw, this.trail[i].y * ch);
            }
            this.ctx.strokeStyle = '#38bdf8';
            this.ctx.lineWidth = 4;
            this.ctx.stroke();

            const tip = this.trail[this.trail.length - 1];
            this.ctx.beginPath();
            this.ctx.arc(tip.x * cw, tip.y * ch, 16, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#ef4444';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        // Draw HUD Status Bar on top of camera feed so you always know what it sees
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        this.ctx.fillRect(0, 0, cw, 30);
        this.ctx.fillStyle = now < this.cooldownUntil ? '#facc15' : '#4ade80';
        this.ctx.font = 'bold 13px sans-serif';
        this.ctx.fillText(now < this.cooldownUntil ? 'SHOT RECORDED — NEXT BALL IN 3s' : this.statusText, 10, 20);

        this.prevData = new Uint8ClampedArray(currData);
        requestAnimationFrame(() => this.loop());
    }

    analyzeTrajectory() {
        if (this.trail.length < 4) return;

        // Compare incoming vector (p0 -> p1) vs outgoing vector (p2 -> p3)
        const p0 = this.trail[0];
        const p1 = this.trail[Math.floor(this.trail.length / 2)];
        const p2 = this.trail[this.trail.length - 2];
        const p3 = this.trail[this.trail.length - 1];

        const v1x = p1.x - p0.x;
        const v1y = p1.y - p0.y;
        const v2x = p3.x - p2.x;
        const v2y = p3.y - p2.y;

        const mag1 = Math.hypot(v1x, v1y);
        const mag2 = Math.hypot(v2x, v2y);

        if (mag1 < 0.03 || mag2 < 0.03) return; // Ignore tiny jitters

        // Dot product checks angle change between incoming ball and hit shot
        const cosAngle = (v1x * v2x + v1y * v2y) / (mag1 * mag2);

        // If direction reverses or deflects sharply (> 75 degrees, cosAngle < 0.25)
        if (cosAngle < 0.25) {
            const dt = Math.max(0.016, (p3.t - p2.t) / 1000);
            const normSpeed = mag2 / dt; // screen-widths per second

            // Map screen-widths/sec (0.5 to 3.5) to realistic bat exit speed (18 to 40 m/s)
            const speedMs = Math.min(40, Math.max(18, 15 + normSpeed * 8.5));

            // Azimuth angle based on horizontal screen exit direction (-90 leg side to +90 off side)
            const azimuthDeg = Math.round((Math.atan2(v2x, -v2y) * 180) / Math.PI);

            // Elevation inferred from upward launch component
            const upwardRatio = Math.max(0, -v2y / mag2);
            const elevationDeg = Math.min(52, Math.max(6, Math.round(upwardRatio * 45)));

            this.cooldownUntil = performance.now() + 3000;
            this.trail = [];
            this.onShotDetected({
                speedMs: Math.round(speedMs * 10) / 10,
                azimuthDeg,
                elevationDeg
            });
        }
    }
}