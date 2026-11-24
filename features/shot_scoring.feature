Feature: Cricket Net Shot Run Prediction
  Scenario: Lofted straight drive clears the 65m boundary
    Given the boundary radius is 65 meters
    When the batsman hits the ball at 34 m/s with 0 degree angle and 28 degree elevation
    Then the predicted outcome should be 6 runs