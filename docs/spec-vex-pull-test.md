# 02a. Motor and Drive Matcher: VEX pull test addendum

Draft for review. Extends `spec.md` for a VEX V5 classroom challenge. Everything in `spec.md` and `conventions.md` still applies unless this addendum changes it.

## 1. Purpose

Students build a vehicle from VEX parts, driven by two V5 Smart Motors (11 W) with green 18:1 cartridges. The challenge is the largest pulling force against a Vernier force sensor in a **static** pull: the vehicle is tethered to a fixed sensor and pulls until it stops moving. The motor program runs both motors in velocity mode at 150 rpm. Every vehicle adds an external gear reduction.

The tool already predicts when the motors stall. This addendum adds the second limit, wheel grip, so students can predict which limit decides their pull and design around it.

### Learning targets

Students can:

1. Explain why the 150 rpm speed setting does not limit a static pull.
2. Calculate the motor-limited pull from stall torque, gear ratio, efficiency and wheel radius.
3. Calculate the traction-limited pull from the coefficient of friction and the weight on the driven wheels.
4. Predict the pull as the smaller of the two, and name which one limits.
5. Find the crossover ratio past which more gearing adds no pull, and the mass needed to use a given ratio fully.

## 2. Scope

### In this addendum

- A V5 Smart Motor (11 W) entry in the motor list, with a cartridge choice.
- A **Pull test** panel: wheel choice, vehicle mass, fraction of weight on driven wheels, coefficient of friction, and an optional measured force.
- A pull force against gear ratio chart.
- A predict-first target for the maximum pull.

### Not in this addendum

- Moving (dynamic) pulls. The velocity-mode speed cap matters there and is left for a later addendum.
- Weight transfer from a tow point above the axle, wheel deflection, rolling resistance.
- Thermal derating over time. The help text tells students to record the peak force in the first few seconds.

## 3. Model and math

### 3.1 Motor

- V5 Smart Motor (11 W): 2.1 N·m stall torque with the 36:1 red cartridge (VEX). Torque scales with the cartridge ratio, so:
  - red 36:1: T_s = 2.1 N·m, N₀ = 100 rpm
  - green 18:1: T_s = 1.05 N·m, N₀ = 200 rpm
  - blue 6:1: T_s = 0.35 N·m, N₀ = 600 rpm
- The V5 is not a straight-line motor. VEX's performance chart (torque, current and power against percent of maximum rpm) shows torque roughly flat from stall up to about 60% of maximum rpm, then falling. A static pull happens at zero speed, inside the flat region, so the stall torque above is the value that matters. The straight-line plot in `spec.md` 3.1 understates the V5 between stall and about 60% speed; help text must say this when the V5 preset is in use.
- The motor's own controller limits current to 2.5 A. In velocity mode, a tethered vehicle cannot reach 150 rpm, so the controller drives full current and the motor delivers its stall torque. **The speed setpoint does not enter the static pull calculation.** Help text must say this.
- Two motors drive one vehicle: k = 2, treated as motors in parallel (`spec.md` 3.1).

### 3.2 Motor-limited pull

The external reduction i and its efficiency η come from the existing gearing panel. With wheel radius r:

F_motor = k · T_s · i · η / r

This is the existing force-at-radius load with the motor at stall, so it uses the same sources as `spec.md` 3.2 (torque = force × radius, OpenStax).

### 3.3 Traction-limited pull

With vehicle mass m, fraction f of the weight on the driven wheels (1 when every wheel is driven), coefficient of static friction μ between the driven tires and the floor, and g = 9.81 m/s²:

F_traction = μ · f · m · g

Source: OpenStax College Physics 2e, 5.1 Friction (f_s ≤ μ_s N).

### 3.4 Predicted pull and the crossover

- Predicted pull F = min(F_motor, F_traction). Limiting factor: "motor" when F_motor < F_traction, "traction" otherwise. When the two are within 1%, report "both, balanced".
- Crossover ratio, where the two limits are equal: i* = μ f m g r / (k T_s η). Above i*, more gearing adds no pull.
- Mass needed to use the current ratio fully: m* = F_motor / (μ f g). With no weight limit in this challenge, this is the design lever students should find: add mass on the driven wheels and gear down together.

### 3.5 Measuring μ

The coefficient comes from the students' own floor and tires, not a preset. Procedure for help:

1. Program both motors to brake in hold mode so the wheels cannot turn.
2. Weigh the vehicle (m), and estimate f.
3. Pull it horizontally with the Vernier sensor at axle height until it slides. Record the peak force F_slide.
4. μ = F_slide / (f m g) if only the driven wheels are locked and the others roll freely; μ = F_slide / (m g) if every wheel is locked.

Omni wheels contact the floor through their rollers, so their μ is usually different from a traction wheel's. Students should measure each wheel type they consider.

## 4. Inputs and controls

| Input | Symbol | Unit | Range | Default | Notes |
|---|---|---|---|---|---|
| Motor | | | list | V5 11 W, green 18:1 | Cartridge switch: red, green, blue |
| Motors | k | | 1 to 4 | 2 | Existing control |
| Wheel | r | mm | 5 to 200 | 4" traction (50.8) | Presets below, or custom radius |
| Vehicle mass | m | kg | 0.1 to 100 | blank | Measured on a scale |
| Weight on driven wheels | f | % | 1 to 100 | 100 | |
| Coefficient of friction | μ | | 0.01 to 2 | blank | Measured, see 3.5 |
| Measured pull | F_meas | N | 0 to 2000 | blank | Optional, from the Vernier sensor |

Wheel presets (nominal diameter; students should measure their own):

| Wheel | Diameter | Radius |
|---|---|---|
| 2.75" traction | 2.75 in | 34.9 mm |
| 4" traction | 4 in | 50.8 mm |
| 200 mm omni | 200 mm travel per turn (63.7 mm diameter) | 31.8 mm |

## 5. Outputs

### Readout

- F_motor, F_traction, predicted pull F and the limiting factor, in words and with an icon (not color alone).
- Crossover ratio i* and, when traction limits, the mass m* needed to make the motors the limit at the current ratio.
- When a measured pull is entered: "You measured X. The model gives Y (Z% difference)." using the percent difference rule in `conventions.md` 3.

### Chart: pull force against gear ratio

- x axis: external ratio i, from 0 to the larger of 2 i* and 2 × the current ratio.
- Motor line rising through the origin (slope k T_s η / r), traction ceiling as a flat line, the predicted pull as the lower envelope (bold).
- Crossover point labeled i*. Current design marked as a dot, hidden in predict-first mode.

### Show the working

F_motor, F_traction, min, i* and m*, each with formula, numbers substituted and source.

### Predict first

Target: maximum pull F (and which limit applies).

## 6. Test cases

k = 2, T_s = 1.05 N·m (green) unless stated.

| ID | Inputs | Expected |
|---|---|---|
| VP-1 | Cartridges | red 2.1 N·m / 100 rpm; green 1.05 N·m / 200 rpm; blue 0.35 N·m / 600 rpm |
| VP-2 | 4" traction (r = 50.8 mm), i = 1, η = 1 | F_motor = 41.3 N |
| VP-3 | 2.75" traction (r = 34.925 mm), i = 3, η = 0.9, m = 5 kg, f = 100%, μ = 0.9 | F_motor = 162 N. F_traction = 44.1 N. F = 44.1 N, traction limits. i* = 0.816. m* = 18.4 kg |
| VP-4 | VP-3 with f = 60% | F_traction = 26.5 N. i* = 0.489 |
| VP-5 | 4" traction, one stage i = 5 (60:12) at η = 0.81, m = 8 kg, f = 100%, μ = 0.9 | F_motor = 167 N. F_traction = 70.6 N. Traction limits |
| VP-6 | 200 mm omni (r = 31.831 mm), i = 1, η = 1 | F_motor = 66.0 N |
| VP-7 | VP-3 with μ = 0 | F_traction = 0, F = 0, traction limits, i* = 0. No division errors; m* shown as "not defined: friction is zero" |
| VP-8 | VP-3 with measured pull 40 N | Percent difference −9.39% |
| VP-9 | VP-3 with m blank | Motor-limited pull shown; traction outputs read "enter the vehicle mass" |

## 7. Acceptance criteria

- [ ] All VP test cases pass in Node and in the interface. Existing MD cases still pass.
- [ ] The help panel explains in one paragraph why the 150 rpm setting does not limit a static pull.
- [ ] The help panel gives the μ measurement procedure in 3.5.
- [ ] The limiting factor is shown in words, not color alone.
- [ ] Predict first hides the pull force, limiting factor and current-design dot.
- [ ] Save files include the pull test inputs; older files load with the pull test panel blank.

## 8. Open questions for review

1. **Green cartridge stall torque.** 1.05 N·m is derived by scaling VEX's published 2.1 N·m (red, 36:1) by the cartridge ratio. The VEX knowledge base article (Understanding V5 Smart Motor (11W) Performance) has the chart but could not be fetched from the build environment. Read the green stall torque off that chart to confirm, or have students measure it.
2. **"200 mm omni".** Read here as VEX's 200 mm travel omni wheel (200 mm per turn). If it means 200 mm diameter, the radius is 100 mm.
3. **Measured pull in the prediction log.** Should a measured value be logged as its own record type, or only shown on screen? This may need a change to the shared `prediction-log` schema upstream.

## 9. Sources

- VEX Robotics, V5 Smart Motor (11 W) specifications: https://www.vexrobotics.com/276-4840.html and https://kb.vex.com/hc/en-us/articles/360044325872-Understanding-V5-Smart-Motor-11W-Performance
- BLRS Wiki (Purdue SIGBots), VEX motors, current limit and velocity control: https://github.com/purduesigbots/BLRS-Wiki/blob/master/vex-electronics/vex-electronics/motors.md
- OpenStax College Physics 2e, 5.1 Friction: https://openstax.org/books/college-physics-2e/pages/5-1-friction
- Torque and power sources as in `spec.md` 9.
