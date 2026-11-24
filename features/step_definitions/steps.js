const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const ScoringEngine = require('../../scoringEngine');

let engine, trajectory, result;

Given('the boundary radius is {int} meters', function (radius) {
    engine = new ScoringEngine(radius);
});

When('the batsman hits the ball at {int} m\\/s with {int} degree angle and {int} degree elevation', function (speed, angle, elev) {
    trajectory = engine.simulateTrajectory(speed, angle, elev);
    result = engine.evaluateShot(trajectory, []);
});

Then('the predicted outcome should be {int} runs', function (expectedRuns) {
    assert.strictEqual(result.runs, expectedRuns);
});