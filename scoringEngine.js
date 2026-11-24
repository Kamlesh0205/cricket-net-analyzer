// scoringEngine.js
class ScoringEngine {
    constructor(boundaryRadius = 65) {
        this.boundaryRadius = boundaryRadius; // in meters
        this.gravity = 9.81;
        this.fielderSpeed = 7.2; // m/s average sprint speed
        this.catchReach = 2.2;   // meters
        this.throwSpeed = 22.0;  // m/s
    }

    /**
     * Simulates 3D projectile trajectory from initial bat impact parameters
     * @param {number} speedMs - Ball exit speed in m/s (e.g., 25 to 42 m/s)
     * @param {number} azimuthDeg - Horizontal angle (-180 to 180, 0 is straight down the ground)
     * @param {number} elevationDeg - Vertical launch angle (0 to 75 degrees)
     */
    simulateTrajectory(speedMs, azimuthDeg, elevationDeg) {
        const azRad = (azimuthDeg * Math.PI) / 180;
        const elRad = (elevationDeg * Math.PI) / 180;

        const vHorizontal = speedMs * Math.cos(elRad);
        const vVertical = speedMs * Math.sin(elRad);

        // Time of flight until first bounce (assuming impact height = 0.8m)
        const impactHeight = 0.8;
        const flightTime = (vVertical + Math.sqrt(vVertical * vVertical + 2 * this.gravity * impactHeight)) / this.gravity;

        // Air carry distance
        const carryDistance = vHorizontal * flightTime;

        // Ground roll distance (friction deceleration ~ 4.5 m/s^2)
        const landingSpeed = vHorizontal * 0.72; // energy lost on bounce
        const rollDistance = (landingSpeed * landingSpeed) / (2 * 4.5);

        const totalDistance = Math.round((carryDistance + rollDistance) * 10) / 10;

        // Landing & final resting coordinates (0,0 is batsman)
        const carryX = carryDistance * Math.sin(azRad);
        const carryY = carryDistance * Math.cos(azRad);
        const finalX = totalDistance * Math.sin(azRad);
        const finalY = totalDistance * Math.cos(azRad);

        return {
            carryDistance: Math.round(carryDistance * 10) / 10,
            totalDistance,
            flightTime: Math.round(flightTime * 100) / 100,
            carryPos: { x: carryX, y: carryY },
            finalPos: { x: finalX, y: finalY },
            isAerial: elevationDeg > 14
        };
    }

    /**
     * Evaluates runs or dismissal against active fielders
     * @param {Object} trajectory - Output from simulateTrajectory()
     * @param {Array} fielders - Array of { id, name, x, y } in meters from batsman
     */

    findNearestFielder(trajectory, fielders) {
     let minFielderTime = Infinity;
     let nearestFielder = null;

     const ratio = trajectory.totalDistance > this.boundaryRadius
         ? this.boundaryRadius / trajectory.totalDistance
         : 1;
     const targetX = trajectory.finalPos.x * ratio;
     const targetY = trajectory.finalPos.y * ratio;

     for (const f of fielders) {
         const sprintTime = Math.hypot(f.x - targetX, f.y - targetY) / this.fielderSpeed;
         if (sprintTime < minFielderTime) {
             minFielderTime = sprintTime;
             nearestFielder = f;
         }
     }
     return { minFielderTime, nearestFielder };
 }


    evaluateShot(trajectory, fielders) {
        // 1. Check Boundary Six (clears boundary on the full)
        if (trajectory.carryDistance >= this.boundaryRadius) {
            return { runs: 6, isWicket: false, dismissalType: null, note: `SIX! Carried ${trajectory.carryDistance}m` };
        }

        // 2. Check Catch Opportunity along aerial path
        if (trajectory.isAerial) {
            for (const f of fielders) {
                const distToCarry = Math.hypot(f.x - trajectory.carryPos.x, f.y - trajectory.carryPos.y);
                const maxReachableDist = (this.fielderSpeed * trajectory.flightTime) + this.catchReach;
                if (distToCarry <= maxReachableDist) {
                    return {
                        runs: 0,
                        isWicket: true,
                        dismissalType: 'CAUGHT',
                        note: `OUT! Caught by ${f.name} at ${trajectory.carryDistance}m`
                    };
                }
            }
        }

        // 3. Check Boundary Four (rolls past boundary before fielder intercepts)
        const { minFielderTime, nearestFielder } = this.findNearestFielder(trajectory, fielders);

const effectiveDist = Math.min(trajectory.totalDistance, this.boundaryRadius);
        const ballTravelTime = trajectory.flightTime + Math.max(0, effectiveDist - trajectory.carryDistance) / 14;
        if (trajectory.totalDistance >= this.boundaryRadius && ballTravelTime < minFielderTime) {
            return { runs: 4, isWicket: false, dismissalType: null, note: `FOUR! Raced past ${nearestFielder?.name || 'fielders'}` };
        }

        // 4. Calculate 0, 1, 2, or 3 runs based on fielder pickup + throw return time
        const distFromPitch = Math.min(trajectory.totalDistance, this.boundaryRadius);
        const throwTime = distFromPitch / this.throwSpeed;
        const totalFieldingTime = Math.max(minFielderTime, ballTravelTime) + throwTime + 0.8; // +0.8s pickup & gather

        // A single takes ~3.2s, second run ~2.8s, third run ~2.8s
        let runs = 0;
        if (totalFieldingTime >= 8.8) runs = 3;
        else if (totalFieldingTime >= 6.0) runs = 2;
        else if (totalFieldingTime >= 3.2) runs = 1;

        return {
            runs,
            isWicket: false,
            dismissalType: null,
            note: `${runs} Run(s) — Fielded by ${nearestFielder?.name || 'fielder'} (${trajectory.totalDistance}m)`
        };
    }
}

// Export for both Browser and Node.js (Jest/Cucumber testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoringEngine;
}