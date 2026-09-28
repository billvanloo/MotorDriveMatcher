# 02. Motor and Drive Matcher

New tool. Supports unit module 1 (speed reducer) and the capstone drive in module 5. Mockup: `mockups/02-motor-drive-matcher.html`. Prototype: the "DC motor operating point" interactive on the unit plan page.

## 1. Purpose

Students describe a DC motor by its datasheet numbers, add gearing, apply a load, and see where the motor actually runs. The tool then solves for the gear ratio that hits a target output speed under load. It targets the most common capstone mistake: choosing a ratio from no-load speed, which makes the machine run slow.

### Learning targets

Students can:

1. Read a DC motor's straight-line torque-speed relationship from stall torque and no-load speed.
2. Find the motor's operating point for a given load, ratio and gearbox efficiency.
3. Explain why maximum mechanical power occurs at half stall torque and half no-load speed.
4. Choose a gear ratio from the loaded speed, not the no-load speed.
5. Judge whether an operating point is in a sensible duty range.
6. (Extension) Estimate current draw and motor efficiency.

## 2. Scope

### In version 1

- Permanent-magnet brushed DC motor at constant voltage, straight-line model.
- One to four identical motors driving the same gearbox (parallel motors add torque at the same speed).
- Up to four gear stages, each with a ratio and efficiency, or a single overall ratio.
- Load entered as output torque, as a force at a radius (pulley, wheel) or as a lifted mass on a spool.
- Target output speed and ratio solver.
- Compare up to three motors on one plot.
- Optional current and efficiency when stall current, no-load current and voltage are entered.

### Not in version 1

- Voltage control (PWM) curves, thermal models, acceleration time, brushless motors.

## 3. Model and math

### 3.1 Motor line

- Motor torque falls linearly with speed: T = T_s (1 − N/N₀), where T_s is stall torque and N₀ is no-load speed (MIT DC motor tutorial; Motion Control Tips).
- Mechanical power P = T ω, with ω = 2πN/60. Power is zero at stall and at no-load and peaks at T = T_s/2, N = N₀/2, where P_max = T_s ω₀ / 4 (MIT tutorial, power curve page).
- With k identical motors in parallel on one gearbox input: stall torque k·T_s, same N₀.

### 3.2 Gearing and load

- Overall ratio i = product of stage ratios. Overall efficiency η = product of stage efficiencies.
- Load torque at the output T_L:
  - Direct entry, or
  - Force at radius: T_L = F · r, or
  - Lifted mass on spool: T_L = m g r, with g = 9.81 m/s².
- Torque the motor must supply: T_m = T_L / (i η).
- Motor speed: N_m = N₀ (1 − T_m / T_s). If T_m ≥ T_s the motor stalls: N_m = 0.
- Output speed: N_out = N_m / i. For a spool or wheel, linear speed v = ω_out · r.
- Output power P_out = T_L · ω_out.

### 3.3 Ratio solver

Given a target N_out and T_L, the ratio satisfies N_out · i = N₀ − N₀ T_L / (η T_s i), which gives

N_out · i² − N₀ · i + N₀ T_L / (η T_s) = 0.

- Discriminant D = N₀² − 4 N_out N₀ T_L / (η T_s).
- If D < 0: no ratio can reach the target with this motor at this load. Show: "This motor cannot deliver that speed at that load. It would need more power than it can make. Try a stronger motor or more motors."
- Otherwise two ratios: i_high = (N₀ + √D) / (2 N_out) and i_low = (N₀ − √D) / (2 N_out). Recommend i_high, which keeps the motor below half its stall torque. Show i_low as "possible but the motor would work above half its stall torque."
- Round the recommendation to the precision the student chooses (for example, nearest available gear pair), then show the resulting speed error against the target.

Note: in this model η is treated as constant. State this in help.

### 3.4 Duty range

One gear motor maker's guidance, shown as bands on the plot (ISL Products):

- Up to 30% of stall torque: continuous duty.
- 30% to 60%: short periods only.
- Above 60%: avoid.

Label the source on the plot legend. Allow the teacher to change the band edges in settings.

### 3.5 Current and efficiency (extension)

When the student enters supply voltage V, no-load current I₀ and stall current I_s:

- Current rises linearly with torque: I = I₀ + (I_s − I₀) · T_m / T_s. This is the same as the no-load current plus load torque divided by the torque constant, with k_t = T_s / (I_s − I₀) (Faulhaber DC motor tutorial).
- Electrical input P_in = V · I. Motor efficiency η_motor = P_mech / P_in, where P_mech = T_m ω_m (Faulhaber).
- Plot current against torque on a secondary axis and efficiency as a curve.

## 4. Inputs and controls

| Input | Symbol | Unit | Range | Default | Notes |
|---|---|---|---|---|---|
| Stall torque | T_s | N·m | 0.001 to 500 | 2 | Unit switch: N·m, N·cm, oz·in, kg·cm |
| No-load speed | N₀ | rpm | 1 to 50,000 | 300 | |
| Motors in parallel | k | | 1 to 4 | 1 | |
| Stage ratios | | | 0.1 to 100 each | 3.14 | Up to 4 stages |
| Stage efficiencies | | | 0.3 to 1.00 | 0.90 | Default labeled "example value, replace with measured" |
| Load type | | | Torque, Force at radius, Lift | Torque | |
| Load torque | T_L | N·m | 0 to 5000 | 0.68 | |
| Force, radius | F, r | N, mm | | 22.6, 30 | |
| Mass, spool radius | m, r | kg, mm | | 5, 20 | |
| Target output speed | N_target | rpm | 0.1 to 50,000 | 95.5 | Optional |
| Voltage, I₀, I_s | V, I₀, I_s | V, A, A | | blank | Extension panel |

Note on units: oz·in and kg·cm (kilogram-force centimeter) appear on many hobby motor datasheets. Convert with 1 oz (force) = 0.27801385 N (from 1 lbf = 16 ozf) and 1 kgf = 9.80665 N.

## 5. Interactions

1. Enter motor data, or choose from a teacher-editable motor list (JSON in settings). Ship the list empty except for one clearly labeled "Example motor (not a real product)" with T_s = 2 N·m and N₀ = 300 rpm.
2. Drag the load torque on the plot horizontally, or type it. The operating point slides along the motor line.
3. Press Solve ratio. The recommended ratio appears with the second root and a speed error after rounding.
4. Add motor to compare: overlays a second or third line in a different line style with its own operating point.
5. Link from the Gear Train Workbench and the Conveyor Designer: accept a JSON handoff with `schema: "drive-request"` containing load torque, target speed and optional stage list; return `schema: "drive-result"` with the chosen ratio, operating point and duty band.

## 6. Outputs

### Plot

- x axis: motor torque (N·m), 0 to 1.05 T_s. y axis: motor speed (rpm), 0 to 1.1 N₀.
- Motor line (solid), power curve (dashed, own scale on the right), duty bands shaded with labels.
- Operating point (dot with label), hidden in predict-first mode.
- Stall marker when stalled.

### Readout

- T_m and percent of stall
- N_m, N_out, and v for spool or wheel loads
- P_out and P_max
- Duty band
- Ratio solver: i_high, i_low, rounded choice, resulting N_out and error
- Extension: I, P_in, η_motor

Predict first targets: N_out, T_m as percent of stall, recommended ratio.

## 7. Test cases

| ID | Inputs | Expected |
|---|---|---|
| MD-1 | T_s = 2 N·m, N₀ = 300 rpm, i = 3.14, η = 0.90, T_L = 0.68 N·m | T_m = 0.241 N·m (12.0% of stall). N_m = 264 rpm. N_out = 84.0 rpm. P_out = 5.99 W. Band: continuous |
| MD-2 | MD-1, target 95.5 rpm, solve | i_high = 2.70. i_low = 0.439 (86.0% of stall, flagged). With i = 2.70: N_out = 95.5 rpm, T_m = 13.98% of stall |
| MD-3 | MD-1 with T_L = 6 N·m | T_m = 2.12 N·m > T_s. Stalled, N_out = 0, message shown |
| MD-4 | T_s = 2, N₀ = 300 | P_max = 15.7 W at 1.00 N·m and 150 rpm |
| MD-5 | Extension. V = 12 V, I₀ = 0.2 A, I_s = 10 A, T_s = 2, N₀ = 300, i = 1, η = 1, T_L = 0.5 N·m | I = 2.65 A. N_m = 225 rpm. P_mech = 11.8 W. P_in = 31.8 W. η_motor = 37.0% |
| MD-6 | T_s = 2, N₀ = 300, η = 0.9, T_L = 2 N·m, target 200 rpm | D < 0. "Cannot deliver" message. No ratio shown |
| MD-7 | Lift load: m = 5 kg, r = 20 mm | T_L = 0.981 N·m |
| MD-8 | Two motors in parallel, each T_s = 2, N₀ = 300, i = 3.14, η = 0.9, T_L = 0.68 | Stall torque 4 N·m. T_m = 0.241 N·m = 6.0% of combined stall. N_m = 282 rpm. N_out = 89.8 rpm |
| MD-9 | Two stages 3 and 4, efficiencies 0.95 and 0.95 | i = 12. η = 0.9025 |
| MD-10 | Unit switch: T_s entered as 200 N·cm | Identical results to T_s = 2 N·m |
| MD-11 | T_L = 0 | N_m = N₀. P_out = 0. No division errors |

## 8. Acceptance criteria

- [ ] All test cases pass in Node and in the interface.
- [ ] The operating point moves continuously while dragging, with the readout updating live.
- [ ] Show the working lists T_L, T_m, percent of stall, N_m, N_out, and for the solver the quadratic with numbers substituted and both roots.
- [ ] Predict first hides the operating point dot, N_out and the solver result.
- [ ] The help panel explains in one paragraph why the no-load speed gives the wrong ratio, using MD-1 and MD-2 as the example.

## 9. Sources

- MIT D.C. motor torque/speed tutorial: http://lancet.mit.edu/motors/motors3.html and power curve page http://lancet.mit.edu/motors/motors4.html
- Motion Control Tips, torque equation and DC motors: https://www.motioncontroltips.com/torque-equation/
- Faulhaber, DC motor calculations: https://www.faulhaber.com/en/know-how/tutorials/dc-motor-tutorial-motor-calculations-for-coreless-brush-dc-motors/
- ISL Products, reading DC gear motor performance curves: https://islproducts.com/design-note/how-to-read-dc-motor-gear-motor-performance-curves/
- OpenStax University Physics Vol. 1, 10.8 (P = τω): https://openstax.org/books/university-physics-volume-1/pages/10-8-work-and-power-for-rotational-motion
