// app.js
const engine = new ScoringEngine(65);

let matchState = {
    runs: 0,
    wickets: 0,
    balls: 0,
    maxOvers: 5,
    maxWickets: 3,
    isOver: false,
    shots: []
};

const FIELD_PRESETS = {
    standard: [
        { id: 1, name: 'Slip', x: 5, y: -6 },
        { id: 2, name: 'Point', x: 26, y: 2 },
        { id: 3, name: 'Cover', x: 24, y: 22 },
        { id: 4, name: 'Mid-Off', x: 10, y: 28 },
        { id: 5, name: 'Mid-On', x: -10, y: 28 },
        { id: 6, name: 'Mid-Wicket', x: -26, y: 18 },
        { id: 7, name: 'Square Leg', x: -28, y: 0 },
        { id: 8, name: 'Fine Leg', x: -16, y: -35 },
        { id: 9, name: 'Deep Cover', x: 48, y: 32 }
    ],
    attacking: [
        { id: 1, name: '1st Slip', x: 4, y: -6 },
        { id: 2, name: '2nd Slip', x: 7, y: -5 },
        { id: 3, name: 'Gully', x: 14, y: -2 },
        { id: 4, name: 'Short Cover', x: 18, y: 14 },
        { id: 5, name: 'Mid-Off', x: 10, y: 24 },
        { id: 6, name: 'Mid-On', x: -10, y: 24 },
        { id: 7, name: 'Short Mid-Wicket', x: -18, y: 12 },
        { id: 8, name: 'Square Leg', x: -24, y: 0 },
        { id: 9, name: 'Fine Leg', x: -18, y: -30 }
    ],
    death: [
        { id: 1, name: 'Third Man', x: 25, y: -52 },
        { id: 2, name: 'Deep Point', x: 58, y: 5 },
        { id: 3, name: 'Deep Cover', x: 50, y: 36 },
        { id: 4, name: 'Long-Off', x: 22, y: 58 },
        { id: 5, name: 'Long-On', x: -22, y: 58 },
        { id: 6, name: 'Deep Mid-Wicket', x: -50, y: 34 },
        { id: 7, name: 'Deep Square', x: -58, y: 2 },
        { id: 8, name: 'Fine Leg', x: -28, y: -50 },
        { id: 9, name: 'Extra Cover', x: 26, y: 24 }
    ]
};

let activeFielders = JSON.parse(JSON.stringify(FIELD_PRESETS.standard));
let draggingFielder = null;
let lastTrajectory = null;

const fieldCanvas = document.getElementById('fieldCanvas');
const fCtx = fieldCanvas.getContext('2d');

// Coordinate conversion: Field meters (-65..+65) <-> Canvas pixels (0..380)
function metersToCanvas(mx, my) {
    const cx = fieldCanvas.width / 2;
    const cy = fieldCanvas.height / 2;
    const scale = (fieldCanvas.width / 2 - 14) / engine.boundaryRadius;
    // Note: +y in cricket is straight down the ground (towards top of screen)
    return { x: cx + mx * scale, y: cy - my * scale };
}

function canvasToMeters(px, py) {
    const cx = fieldCanvas.width / 2;
    const cy = fieldCanvas.height / 2;
    const scale = (fieldCanvas.width / 2 - 14) / engine.boundaryRadius;
    return { x: (px - cx) / scale, y: (cy - py) / scale };
}

function drawGround() {
    const w = fieldCanvas.width, h = fieldCanvas.height;
    fCtx.clearRect(0, 0, w, h);

    // 30-yard inner circle
    fCtx.beginPath();
    fCtx.arc(w / 2, h / 2, (w / 2 - 14) * (30 / engine.boundaryRadius), 0, Math.PI * 2);
    fCtx.strokeStyle = 'rgba(255,255,255,0.45)';
    fCtx.setLineDash([5, 5]);
    fCtx.stroke();
    fCtx.setLineDash([]);

    // Pitch strip
    fCtx.fillStyle = '#d6c79c';
    fCtx.fillRect(w / 2 - 6, h / 2 - 10, 12, 42);

    // Draw Wagon Wheel history
    matchState.shots.forEach(s => {
        const start = metersToCanvas(0, 0);
        const end = metersToCanvas(s.trajectory.finalPos.x, s.trajectory.finalPos.y);
        fCtx.beginPath();
        fCtx.moveTo(start.x, start.y);
        fCtx.lineTo(end.x, end.y);
        fCtx.strokeStyle = s.result.isWicket ? '#ef4444' : s.result.runs === 6 ? '#facc15' : s.result.runs === 4 ? '#38bdf8' : 'rgba(255,255,255,0.4)';
        fCtx.lineWidth = s.result.runs >= 4 ? 3 : 1.5;
        fCtx.stroke();
    });

    // Draw Fielders
    activeFielders.forEach(f => {
        const pos = metersToCanvas(f.x, f.y);
        fCtx.beginPath();
        fCtx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        fCtx.fillStyle = '#2563eb';
        fCtx.fill();
        fCtx.strokeStyle = '#fff';
        fCtx.lineWidth = 1.5;
        fCtx.stroke();

        fCtx.fillStyle = '#fff';
        fCtx.font = '10px sans-serif';
        fCtx.fillText(f.name, pos.x + 9, pos.y + 3);
    });
}

function handleShot({ speedMs, azimuthDeg, elevationDeg }) {
    if (matchState.isOver) return;

    const trajectory = engine.simulateTrajectory(speedMs, azimuthDeg, elevationDeg);
    const result = engine.evaluateShot(trajectory, activeFielders);

    matchState.balls++;
    if (result.isWicket) {
        matchState.wickets++;
    } else {
        matchState.runs += result.runs;
    }

    matchState.shots.push({ trajectory, result });
    lastTrajectory = trajectory;

    updateScoreboard(trajectory, result);
    drawGround();
}

function updateScoreboard(trajectory, result) {
    document.getElementById('runsDisplay').textContent = matchState.runs;
    document.getElementById('wicketsDisplay').textContent = matchState.wickets;

    const completedOvers = Math.floor(matchState.balls / 6);
    const ballsInOver = matchState.balls % 6;
    document.getElementById('oversDisplay').textContent = `${completedOvers}.${ballsInOver}`;
    document.getElementById('wicketsLeftDisplay').textContent = Math.max(0, matchState.maxWickets - matchState.wickets);
    document.getElementById('lastDistanceDisplay').textContent = `${trajectory.totalDistance} m`;

    const banner = document.getElementById('eventBanner');
    banner.textContent = `${result.note} | Exit Speed: ${Math.round(trajectory.totalDistance * 1.4)} km/h`;
    banner.style.color = result.isWicket ? '#f87171' : result.runs >= 4 ? '#facc15' : '#38bdf8';

    const li = document.createElement('li');
    li.textContent = `[${completedOvers}.${ballsInOver}] ${result.note} (Carry: ${trajectory.carryDistance}m)`;
    document.getElementById('shotLog').prepend(li);

    if (matchState.wickets >= matchState.maxWickets || completedOvers >= matchState.maxOvers) {
        matchState.isOver = true;
        banner.textContent = `INNINGS COMPLETE! Final Score: ${matchState.runs}/${matchState.wickets} in ${completedOvers}.${ballsInOver} Overs`;
    }
}

// Drag-and-drop fielders on canvas
fieldCanvas.addEventListener('pointerdown', e => {
    const rect = fieldCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (fieldCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (fieldCanvas.height / rect.height);

    for (const f of activeFielders) {
        const pos = metersToCanvas(f.x, f.y);
        if (Math.hypot(pos.x - px, pos.y - py) < 16) {
            draggingFielder = f;
            return;
        }
    }

    // If not dragging a fielder, clicking grass simulates a shot to that spot!
    const m = canvasToMeters(px, py);
    const dist = Math.hypot(m.x, m.y);
    const azimuthDeg = (Math.atan2(m.x, m.y) * 180) / Math.PI;
    const speedMs = Math.min(40, Math.max(16, dist * 0.52));
    handleShot({ speedMs, azimuthDeg, elevationDeg: dist > 55 ? 26 : 12 });
});

fieldCanvas.addEventListener('pointermove', e => {
    if (!draggingFielder) return;
    const rect = fieldCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (fieldCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (fieldCanvas.height / rect.height);
    const m = canvasToMeters(px, py);
    draggingFielder.x = Math.round(m.x);
    draggingFielder.y = Math.round(m.y);
    drawGround();
});

fieldCanvas.addEventListener('pointerup', () => { draggingFielder = null; });

// Controls
const tracker = new VisionTracker(
    document.getElementById('cameraVideo'),
    document.getElementById('visionCanvas'),
    handleShot
);

document.getElementById('startCamBtn').addEventListener('click', () => tracker.startCamera());
document.getElementById('ballTypeSelect').addEventListener('change', e => tracker.setBallType(e.target.value));
document.getElementById('simShotBtn').addEventListener('click', () => {
    handleShot({
        speedMs: 20 + Math.random() * 19,
        azimuthDeg: -140 + Math.random() * 280,
        elevationDeg: 6 + Math.random() * 28
    });
});

document.getElementById('fieldPresetSelect').addEventListener('change', e => {
    activeFielders = JSON.parse(JSON.stringify(FIELD_PRESETS[e.target.value]));
    drawGround();
});

document.getElementById('resetMatchBtn').addEventListener('click', () => {
    engine.boundaryRadius = Number(document.getElementById('inputBoundary').value) || 65;
    matchState = {
        runs: 0,
        wickets: 0,
        balls: 0,
        maxOvers: Number(document.getElementById('inputOvers').value) || 5,
        maxWickets: Number(document.getElementById('inputWickets').value) || 3,
        isOver: false,
        shots: []
    };
    document.getElementById('maxOversDisplay').textContent = matchState.maxOvers;
    document.getElementById('runsDisplay').textContent = '0';
    document.getElementById('wicketsDisplay').textContent = '0';
    document.getElementById('oversDisplay').textContent = '0.0';
    document.getElementById('wicketsLeftDisplay').textContent = matchState.maxWickets;
    document.getElementById('shotLog').innerHTML = '';
    drawGround();
});

drawGround();