const ScoringEngine = require('../scoringEngine');

describe('Experiment 3 (TDD) & Experiment 9 (BDD): Cricket Shot Scoring', () => {
    const engine = new ScoringEngine(65);

    test('Given an aerial shot carrying 72m, When evaluated, Then award 6 runs', () => {
        const traj = engine.simulateTrajectory(34, 0, 28); // Straight lofted drive
        const result = engine.evaluateShot(traj, []);
        expect(result.runs).toBe(6);
        expect(result.isWicket).toBe(false);
    });

    test('Given a fielder stationed at Cover (24, 22), When a lofted drive lands near Cover, Then batsman is CAUGHT OUT', () => {
        const traj = engine.simulateTrajectory(24, 45, 25);
        const fielders = [{ id: 1, name: 'Cover', x: 22, y: 22 }];
        const result = engine.evaluateShot(traj, fielders);
        expect(result.isWicket).toBe(true);
        expect(result.dismissalType).toBe('CAUGHT');
    });

    test('Given a ground drive piercing the gap at 70m total distance, When no fielder intercepts, Then award 4 runs', () => {
        const traj = engine.simulateTrajectory(40, 30, 8);
        const fielders = [{ id: 1, name: 'Mid-On', x: -15, y: 30 }];
        const result = engine.evaluateShot(traj, fielders);
        expect(result.runs).toBe(4);
    });
});