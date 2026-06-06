const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  lessonName: document.querySelector("#lessonName"),
  targetText: document.querySelector("#targetText"),
  instructionText: document.querySelector("#instructionText"),
  routeSteps: document.querySelector("#routeSteps"),
  score: document.querySelector("#score"),
  streak: document.querySelector("#streak"),
  modeText: document.querySelector("#modeText"),
  coachText: document.querySelector("#coachText"),
  coachDetail: document.querySelector("#coachDetail"),
  coachPanel: document.querySelector(".coach-panel"),
  stepList: document.querySelector("#stepList"),
  eventList: document.querySelector("#eventList"),
  speedText: document.querySelector("#speedText"),
  speedFill: document.querySelector("#speedFill"),
  gearText: document.querySelector("#gearText"),
  leftSignal: document.querySelector("#leftSignal"),
  rightSignal: document.querySelector("#rightSignal"),
  hazardSignal: document.querySelector("#hazardSignal"),
  mirrorBtn: document.querySelector("#mirrorBtn"),
  blindBtn: document.querySelector("#blindBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  modeGuided: document.querySelector("#modeGuided"),
  modeTest: document.querySelector("#modeTest"),
};

const TAU = Math.PI * 2;
const ENTRY_ANGLE = Math.PI / 2;
const ROAD_HALF = 74;
const RING_OUTER = 188;
const RING_INNER = 96;
const LANE_SPLIT_RADIUS = 142;
const WORLD_LIMIT = 920;

const keys = new Set();
const scenery = makeScenery();

const scenarios = [
  {
    id: "left",
    lesson: "Two-lane town roundabout",
    target: "Take the first exit left",
    instruction: "Use the left approach lane, signal left early, and keep to the outside lane.",
    exitIndex: 1,
    exitArm: "west",
    approachLane: "left",
    ringLane: "outer",
    approachSignal: "left",
    laneHint: "Left lane for first exit",
    entryHint: "Give way to traffic from the right before joining.",
  },
  {
    id: "ahead",
    lesson: "Two-lane town roundabout",
    target: "Take the second exit ahead",
    instruction: "Approach in the left lane unless markings say otherwise, then signal left after the first exit.",
    exitIndex: 2,
    exitArm: "north",
    approachLane: "left",
    ringLane: "outer",
    approachSignal: "none",
    laneHint: "Left lane, no approach signal for straight ahead",
    entryHint: "Wait until the right-hand gap is safe.",
  },
  {
    id: "right",
    lesson: "Two-lane town roundabout",
    target: "Take the third exit right",
    instruction: "Approach in the right lane, signal right, then signal left after the second exit.",
    exitIndex: 3,
    exitArm: "east",
    approachLane: "right",
    ringLane: "inner",
    approachSignal: "right",
    laneHint: "Right lane, right signal on approach",
    entryHint: "Join only when traffic from the right is not close.",
  },
  {
    id: "full",
    lesson: "Full-circle drill",
    target: "Go full circle and leave south",
    instruction: "Approach right, keep right around the roundabout, then signal left after the third exit.",
    exitIndex: 4,
    exitArm: "south",
    approachLane: "right",
    ringLane: "inner",
    approachSignal: "right",
    laneHint: "Right lane for going full circle",
    entryHint: "Treat the final exit like any other: left signal after the previous exit.",
  },
];

let view = { w: 1, h: 1, scale: 1, ox: 0, oy: 0, dpr: 1 };
let lastTime = performance.now();

const state = {
  mode: "guided",
  scenarioIndex: 0,
  score: 100,
  streak: 0,
  eventItems: [],
  time: 0,
  signal: "none",
  mirrorAt: -99,
  blindAt: -99,
  feedbackCooldowns: new Map(),
  completedAt: null,
  player: makePlayer(),
  ai: [],
  checks: {},
};

function makePlayer() {
  return {
    x: -48,
    y: 430,
    px: -48,
    py: 430,
    heading: -Math.PI / 2,
    speed: 0,
    maxSpeed: 260,
    length: 34,
    width: 19,
  };
}

function resetDrill(keepScore = true) {
  state.player = makePlayer();
  state.signal = "none";
  state.mirrorAt = -99;
  state.blindAt = -99;
  state.feedbackCooldowns.clear();
  state.completedAt = null;
  state.checks = {
    approach: false,
    entry: false,
    enteredRing: false,
    maxProgress: 0,
    warnedExitSignal: false,
    lastRingLane: null,
    lastLaneChangeAt: -99,
    targetExitSeen: false,
    wrongExit: false,
    offroadAt: -99,
  };

  if (!keepScore) {
    state.score = 100;
    state.streak = 0;
    state.eventItems = [];
  }

  seedTraffic();
  syncUi();
  addEvent("info", currentScenario().entryHint);
}

function seedTraffic() {
  const base = (state.scenarioIndex * 0.43) % 1;
  state.ai = [
    { type: "car", angle: 0.18 + base, radius: 123, speed: 0.54, color: "#7bdff2" },
    { type: "car", angle: 2.15 + base, radius: 158, speed: 0.47, color: "#f2b5d4" },
    { type: "van", angle: 4.05 + base, radius: 124, speed: 0.39, color: "#e5e5e5" },
    { type: "cycle", angle: 5.22 + base, radius: 166, speed: 0.29, color: "#52d273" },
  ];
}

function currentScenario() {
  return scenarios[state.scenarioIndex];
}

function resize() {
  view.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const side = Math.min(view.w, view.h);
  view.scale = Math.max(0.54, Math.min(1.16, side / 790));
  view.ox = view.w / 2;
  view.oy = view.h / 2 + (view.w < 900 ? 76 : -38);
}

function makeScenery() {
  const items = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 90; i += 1) {
    const x = rand() * WORLD_LIMIT * 2 - WORLD_LIMIT;
    const y = rand() * WORLD_LIMIT * 2 - WORLD_LIMIT;
    if (Math.abs(x) < 105 || Math.abs(y) < 105 || Math.hypot(x, y) < 245) {
      continue;
    }
    items.push({
      x,
      y,
      r: 2 + rand() * 8,
      color: rand() > 0.6 ? "#2f684f" : "#376348",
    });
  }
  return items;
}

function setSignal(nextSignal) {
  state.signal = state.signal === nextSignal ? "none" : nextSignal;
  syncUi();
}

function setMode(mode) {
  state.mode = mode;
  ui.modeGuided.classList.toggle("active", mode === "guided");
  ui.modeTest.classList.toggle("active", mode === "test");
  syncUi();
  addEvent("info", mode === "guided" ? "Guided mode: live hints are on." : "Test mode: hints are quieter, feedback still counts.");
}

function nextScenario() {
  state.scenarioIndex = (state.scenarioIndex + 1) % scenarios.length;
  resetDrill(true);
}

function addEvent(kind, message) {
  state.eventItems.unshift({ kind, message });
  state.eventItems = state.eventItems.slice(0, 7);
  renderEvents();
}

function penalise(key, points, message, cooldown = 2.2) {
  const last = state.feedbackCooldowns.get(key) ?? -99;
  if (state.time - last < cooldown) return;
  state.feedbackCooldowns.set(key, state.time);
  state.score = Math.max(0, state.score - points);
  state.streak = 0;
  addEvent(points >= 8 ? "bad" : "warn", message);
  syncUi();
}

function reward(key, points, message) {
  if (state.checks[key]) return;
  state.checks[key] = true;
  state.score = Math.min(100, state.score + points);
  state.streak += 1;
  addEvent("good", message);
  syncUi();
}

function renderEvents() {
  ui.eventList.innerHTML = "";
  for (const item of state.eventItems) {
    const li = document.createElement("li");
    li.className = item.kind;
    li.textContent = item.message;
    ui.eventList.appendChild(li);
  }
}

function syncUi() {
  const scenario = currentScenario();
  ui.lessonName.textContent = scenario.lesson;
  ui.targetText.textContent = scenario.target;
  ui.instructionText.textContent =
    state.mode === "guided" ? simpleRouteSentence(scenario) : "Try the route without hints. The checklist still shows your progress.";
  renderRouteSteps(routePlanItems(scenario));
  ui.score.textContent = String(Math.round(state.score));
  ui.streak.textContent = String(state.streak);
  ui.modeText.textContent = state.mode === "guided" ? "Guided" : "Test";
  ui.leftSignal.classList.toggle("active", state.signal === "left");
  ui.leftSignal.setAttribute("aria-pressed", String(state.signal === "left"));
  ui.rightSignal.classList.toggle("active", state.signal === "right");
  ui.rightSignal.setAttribute("aria-pressed", String(state.signal === "right"));
  ui.hazardSignal.classList.toggle("active", state.signal === "none");
  ui.hazardSignal.setAttribute("aria-pressed", String(state.signal === "none"));
}

function updateHud() {
  const speedMph = Math.round(Math.max(0, state.player.speed) / 5.8);
  const guidance = guidanceState();
  ui.speedText.textContent = `${speedMph} mph`;
  ui.speedFill.style.width = `${Math.min(100, speedMph * 2.1)}%`;
  ui.gearText.textContent = state.player.speed < -2 ? "R" : "D";
  ui.coachText.textContent = guidance.action;
  ui.coachDetail.textContent = guidance.detail;
  ui.coachPanel.dataset.tone = guidance.tone;
  renderStepList(guidance.steps);
}

function guidanceState() {
  const scenario = currentScenario();
  const steps = checklistItems(scenario);
  if (state.completedAt) {
    return {
      action: "Drill complete",
      detail: "Press Next drill for another roundabout situation.",
      tone: "good",
      steps,
      tag: null,
    };
  }

  if (state.mode === "test") {
    return {
      action: "Your turn",
      detail: "Follow the four steps. Feedback appears after each decision.",
      tone: "info",
      steps,
      tag: null,
    };
  }

  const p = state.player;
  const ring = ringLane(p.x, p.y);
  const approachLane = southApproachLane(p.x, p.y);
  const signalOk = approachSignalOk(scenario);

  if (!state.checks.approach && state.time - state.mirrorAt >= 5 && p.y > 330) {
    return {
      action: "Check mirrors",
      detail: "Press Mirrors, then slow down. This builds the habit before changing speed or position.",
      tone: "info",
      steps,
      tag: { text: "MIRRORS", x: -68, y: 300 },
    };
  }

  if (!state.checks.approach && approachLane !== scenario.approachLane && p.y > 330) {
    return {
      action: `Move to the ${scenario.approachLane} lane`,
      detail: "Set your lane early, before the give-way line. The yellow guide shows the correct lane.",
      tone: "warn",
      steps,
      tag: { text: `${scenario.approachLane.toUpperCase()} LANE`, x: scenario.approachLane === "left" ? -52 : -18, y: 330 },
    };
  }

  if (!state.checks.approach && !signalOk && p.y > 330) {
    const action =
      scenario.approachSignal === "none" ? "Keep signals off for now" : `Signal ${scenario.approachSignal}`;
    return {
      action,
      detail:
        scenario.approachSignal === "none"
          ? "For this exit, normally do not signal on approach. Signal left later when you are leaving."
          : "Use the signal before the roundabout so others understand where you plan to go.",
      tone: "info",
      steps,
      tag: { text: scenario.approachSignal === "none" ? "NO SIGNAL" : `${scenario.approachSignal.toUpperCase()} SIGNAL`, x: -44, y: 286 },
    };
  }

  if (nearEntryLine(p)) {
    return {
      action: "Look right. Give way.",
      detail: "Traffic already on the roundabout, or coming from your right, has priority. Creep or stop until the gap is safe.",
      tone: "warn",
      steps,
      tag: { text: "LOOK RIGHT", x: -44, y: RING_OUTER + 54 },
    };
  }

  if (!state.checks.approach && p.y < 470) {
    return {
      action: "Slow down gently",
      detail: "You are set up. Roll towards the give-way markings and be ready to stop.",
      tone: "info",
      steps,
      tag: { text: "SLOW", x: -44, y: 230 },
    };
  }

  if (ring) {
    const prevExit = (scenario.exitIndex - 1) * (Math.PI / 2);
    if (state.checks.maxProgress > prevExit && state.signal !== "left") {
      return {
        action: "Signal left now",
        detail: "You have passed the exit before yours. Signal left, then leave smoothly.",
        tone: "warn",
        steps,
        tag: { text: "SIGNAL LEFT", x: exitTagPosition(scenario).x, y: exitTagPosition(scenario).y },
      };
    }
    if (scenario.ringLane === "inner" && ring !== "inner" && state.checks.maxProgress < prevExit) {
      return {
        action: "Keep the inner lane",
        detail: "For this route, stay right around the roundabout until it is time to move out for the exit.",
        tone: "warn",
        steps,
        tag: { text: "INNER LANE", x: 0, y: -132 },
      };
    }
    return {
      action: `Hold the ${scenario.ringLane} lane`,
      detail: "Keep a steady speed and watch the traffic crossing in front of you.",
      tone: "info",
      steps,
      tag: { text: scenario.ringLane === "inner" ? "INNER" : "OUTER", x: -116, y: 36 },
    };
  }

  if (state.checks.enteredRing && isOnExitRoad(p.x, p.y)) {
    return {
      action: "Cancel signal. Stay left.",
      detail: "You are leaving the roundabout. Settle into the left side of the exit road.",
      tone: "good",
      steps,
      tag: null,
    };
  }

  return {
    action: "Drive on the left",
    detail: "Keep the car between the lane markings and follow the yellow route.",
    tone: "info",
    steps,
    tag: null,
  };
}

function simpleRouteSentence(scenario) {
  return `${capitalise(scenario.approachLane)} lane. ${approachSignalLabel(scenario)}. Give way to the right. ${exitPlanLabel(scenario)}.`;
}

function routePlanItems(scenario) {
  return [
    `${capitalise(scenario.approachLane)} lane`,
    approachSignalLabel(scenario),
    "Give way right",
    exitPlanLabel(scenario),
  ];
}

function checklistItems(scenario) {
  const p = state.player;
  const laneNow = southApproachLane(p.x, p.y);
  const mirrorDone = state.time - state.mirrorAt < 5 || state.checks["approach-mirror-ok"] || state.checks.approach;
  const laneDone = state.checks.approach || laneNow === scenario.approachLane;
  const signalDone = state.checks.approach || approachSignalOk(scenario);
  const entryDone = state.checks["entry-gap-ok"] || state.checks.enteredRing || state.checks.entry;
  const exitDone = Boolean(state.completedAt);

  const items = [
    { label: "Mirrors before slowing", done: mirrorDone },
    { label: `${capitalise(scenario.approachLane)} lane + ${approachSignalLabel(scenario).toLowerCase()}`, done: laneDone && signalDone },
    { label: "Give way to the right", done: entryDone },
    { label: exitPlanLabel(scenario), done: exitDone },
  ];
  const current = items.findIndex((item) => !item.done);

  return items.map((item, index) => ({
    label: item.label,
    state: item.done ? "done" : index === current ? "current" : "pending",
  }));
}

function approachSignalOk(scenario) {
  return scenario.approachSignal === "none" ? state.signal === "none" : state.signal === scenario.approachSignal;
}

function approachSignalLabel(scenario) {
  if (scenario.approachSignal === "none") return "No signal yet";
  return `${capitalise(scenario.approachSignal)} signal`;
}

function exitPlanLabel(scenario) {
  if (scenario.exitIndex === 1) return "Leave 1st exit";
  if (scenario.exitIndex === 2) return "Leave 2nd exit";
  if (scenario.exitIndex === 3) return "Leave 3rd exit";
  return "Leave south";
}

function exitTagPosition(scenario) {
  if (scenario.exitArm === "west") return { x: -226, y: 44 };
  if (scenario.exitArm === "north") return { x: -44, y: -226 };
  if (scenario.exitArm === "east") return { x: 226, y: -44 };
  return { x: 44, y: 226 };
}

function capitalise(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function renderRouteSteps(items) {
  const key = items.join("|");
  if (ui.routeSteps.dataset.key === key) return;
  ui.routeSteps.dataset.key = key;
  ui.routeSteps.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const step = document.createElement("span");
    step.textContent = item;
    fragment.appendChild(step);
  }
  ui.routeSteps.appendChild(fragment);
}

function renderStepList(steps) {
  const key = steps.map((step) => `${step.state}:${step.label}`).join("|");
  if (ui.stepList.dataset.key === key) return;
  ui.stepList.dataset.key = key;
  ui.stepList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = step.state;
    item.dataset.step = String(index + 1);
    item.textContent = step.label;
    fragment.appendChild(item);
  });
  ui.stepList.appendChild(fragment);
}

function bindControls() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);

    if (key === "q") setSignal("left");
    if (key === "e") setSignal("right");
    if (key === "x") {
      state.signal = "none";
      syncUi();
    }
    if (key === "m") checkMirrors();
    if (key === "b") checkBlindSpot();
    if (key === "n") nextScenario();
    if (key === "r") resetDrill(true);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  ui.leftSignal.addEventListener("click", () => setSignal("left"));
  ui.rightSignal.addEventListener("click", () => setSignal("right"));
  ui.hazardSignal.addEventListener("click", () => {
    state.signal = "none";
    syncUi();
  });
  ui.mirrorBtn.addEventListener("click", checkMirrors);
  ui.blindBtn.addEventListener("click", checkBlindSpot);
  ui.nextBtn.addEventListener("click", nextScenario);
  ui.resetBtn.addEventListener("click", () => resetDrill(true));
  ui.modeGuided.addEventListener("click", () => setMode("guided"));
  ui.modeTest.addEventListener("click", () => setMode("test"));
}

function checkMirrors() {
  state.mirrorAt = state.time;
  addEvent("good", "Mirror check logged.");
}

function checkBlindSpot() {
  state.blindAt = state.time;
  addEvent("good", "Blind spot check logged.");
}

function update(dt) {
  state.time += dt;
  updateTraffic(dt);
  updatePlayer(dt);
  applyRules(dt);
  updateHud();
}

function updatePlayer(dt) {
  const p = state.player;
  p.px = p.x;
  p.py = p.y;

  const accelerate = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown") || keys.has(" ");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");

  if (accelerate) p.speed += 138 * dt;
  if (brake) p.speed -= p.speed > 0 ? 210 * dt : 90 * dt;
  if (!accelerate && !brake) {
    const drag = 55 * dt;
    if (p.speed > drag) p.speed -= drag;
    else if (p.speed < -drag) p.speed += drag;
    else p.speed = 0;
  }

  const roadFactor = isOnRoad(p.x, p.y) ? 1 : 0.5;
  p.speed = clamp(p.speed, -42, p.maxSpeed * roadFactor);

  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  const steerPower = clamp(Math.abs(p.speed) / 120, 0.18, 1);
  p.heading += steer * steerPower * 2.45 * dt * (p.speed >= 0 ? 1 : -1);

  p.x += Math.cos(p.heading) * p.speed * dt;
  p.y += Math.sin(p.heading) * p.speed * dt;

  keepInWorld(p);

  if (hitsCentralIsland(p.x, p.y)) {
    const angle = Math.atan2(p.y, p.x);
    p.x = Math.cos(angle) * (RING_INNER + 12);
    p.y = Math.sin(angle) * (RING_INNER + 12);
    p.speed *= -0.18;
    penalise("island", 10, "You clipped the central island. Keep the curve wider and slower.", 2);
  }
}

function keepInWorld(p) {
  p.x = clamp(p.x, -WORLD_LIMIT, WORLD_LIMIT);
  p.y = clamp(p.y, -WORLD_LIMIT, WORLD_LIMIT);
}

function updateTraffic(dt) {
  for (const car of state.ai) {
    car.angle = wrapAngle(car.angle + car.speed * dt);
  }
}

function applyRules() {
  const p = state.player;
  const scenario = currentScenario();

  if (!isOnRoad(p.x, p.y) && Math.abs(p.speed) > 28) {
    penalise("offroad", 8, "Kerb strike. Keep the car inside the carriageway markings.", 2.5);
  }

  if (onWrongSideOfSouthApproach(p.x, p.y)) {
    penalise("wrongside", 7, "You are on the opposing side of the approach. Keep left on UK roads.", 2.5);
  }

  if (!state.checks.approach && p.y < 360) {
    evaluateApproach(scenario);
  }

  if (!state.checks.entry && crossedEntryLine(p)) {
    evaluateEntryGap();
  }

  const lane = ringLane(p.x, p.y);
  if (lane) {
    if (!state.checks.enteredRing) {
      state.checks.enteredRing = true;
      reward("joined", 2, "Joined the roundabout under control.");
    }

    updateRoundaboutProgress(p);
    evaluateRingLane(scenario, lane);
    evaluateExitSignal(scenario);
  }

  evaluateLaneChange(lane);
  evaluateTrafficCollision();
  evaluateExit(scenario);
}

function evaluateApproach(scenario) {
  const lane = southApproachLane(state.player.x, state.player.y);
  const mirrorRecent = state.time - state.mirrorAt < 5;

  if (!mirrorRecent) {
    penalise("approach-mirror", 5, "Mirror check missing before changing speed or position on approach.", 10);
  } else {
    reward("approach-mirror-ok", 1, "Good mirror check before the approach.");
  }

  if (lane !== scenario.approachLane) {
    penalise(
      "approach-lane",
      10,
      `Wrong approach lane. This route expects the ${scenario.approachLane} lane unless signs say otherwise.`,
      12,
    );
  } else {
    reward("approach-lane-ok", 4, "Correct approach lane selected.");
  }

  const wantsSignal = scenario.approachSignal;
  const signalOk = wantsSignal === "none" ? state.signal === "none" : state.signal === wantsSignal;
  if (!signalOk) {
    const text =
      wantsSignal === "none"
        ? "No approach signal is normally needed for this intermediate exit."
        : `Use a ${wantsSignal} signal on approach for this route.`;
    penalise("approach-signal", 6, text, 12);
  } else {
    reward("approach-signal-ok", 3, "Approach signal matched the route.");
  }

  state.checks.approach = true;
  syncUi();
}

function evaluateEntryGap() {
  if (unsafeTrafficFromRight()) {
    penalise("entry-gap", 15, "Unsafe entry. At roundabouts, give priority to traffic approaching from your right.", 6);
  } else {
    reward("entry-gap-ok", 5, "Safe gap taken at the give-way line.");
  }
  state.checks.entry = true;
}

function evaluateRingLane(scenario, lane) {
  const prevExitProgress = (scenario.exitIndex - 1) * (Math.PI / 2);
  const mayMoveOut = state.checks.maxProgress > prevExitProgress + 0.1;
  if (scenario.ringLane === "inner" && lane !== "inner" && !mayMoveOut) {
    penalise("ring-lane", 8, "You drifted out too early. Keep right until you need to alter course for your exit.", 5);
  }
  if (scenario.ringLane === "outer" && lane !== "outer") {
    penalise("ring-lane", 8, "This route should normally stay in the outside lane unless markings direct otherwise.", 5);
  }
}

function evaluateExitSignal(scenario) {
  const prevExitProgress = (scenario.exitIndex - 1) * (Math.PI / 2);
  const targetProgress = scenario.exitIndex * (Math.PI / 2);

  if (state.checks.maxProgress > prevExitProgress + 0.18 && state.checks.maxProgress < targetProgress - 0.15) {
    if (state.signal === "left") {
      reward("exit-signal-ok", 4, "Left signal timed for the exit.");
    } else if (!state.checks.warnedExitSignal && scenario.exitIndex > 1) {
      penalise("exit-signal", 6, "Signal left after passing the exit before the one you want.", 8);
      state.checks.warnedExitSignal = true;
    }
  }
}

function evaluateLaneChange(lane) {
  if (!lane) {
    state.checks.lastRingLane = null;
    return;
  }
  if (state.checks.lastRingLane && state.checks.lastRingLane !== lane) {
    const mirrorOk = state.time - state.mirrorAt < 4;
    const blindOk = state.time - state.blindAt < 4;
    if (!mirrorOk || !blindOk) {
      penalise("lane-change", 7, "Check mirrors and blind spot before changing lane.", 5);
    } else {
      reward(`lane-change-${state.time.toFixed(1)}`, 2, "Lane change checks completed.");
    }
  }
  state.checks.lastRingLane = lane;
}

function evaluateTrafficCollision() {
  const p = state.player;
  for (const other of state.ai) {
    const pos = trafficPosition(other);
    if (Math.hypot(pos.x - p.x, pos.y - p.y) < (other.type === "cycle" ? 24 : 30)) {
      const message =
        other.type === "cycle"
          ? "You cut too close to a cyclist on the roundabout. Give vulnerable road users more room."
          : "Collision risk with traffic already on the roundabout.";
      penalise(`collision-${other.type}`, 18, message, 3.5);
      p.speed *= 0.35;
    }
  }
}

function evaluateExit(scenario) {
  if (state.completedAt || !state.checks.enteredRing) return;
  const arm = exitArmForPosition(state.player.x, state.player.y);
  if (!arm) return;

  const farEnough =
    (arm === "west" && state.player.x < -232) ||
    (arm === "east" && state.player.x > 232) ||
    (arm === "north" && state.player.y < -232) ||
    (arm === "south" && state.player.y > 232);

  if (!farEnough) return;

  if (arm !== scenario.exitArm) {
    penalise("wrong-exit", 20, `Wrong exit taken. Target was ${scenario.target.toLowerCase()}.`, 99);
    state.completedAt = state.time;
    setTimeout(() => resetDrill(true), 1400);
    return;
  }

  if (scenario.exitIndex > 1 && state.signal !== "left") {
    penalise("leave-signal", 8, "You left without the final left signal.", 99);
  }

  if (exitRoadWrongSide(state.player.x, state.player.y, arm)) {
    penalise("exit-side", 8, "Exit onto the left side of the road.", 99);
  } else {
    reward("exit-side-ok", 3, "Exited onto the left side of the road.");
  }

  state.completedAt = state.time;
  state.streak += 1;
  state.score = Math.min(100, state.score + 6);
  addEvent("good", "Route complete. That is a clean training rep.");
  syncUi();
}

function updateRoundaboutProgress(p) {
  let angle = Math.atan2(p.y, p.x);
  while (angle < ENTRY_ANGLE - 0.2) angle += TAU;
  const progress = Math.max(0, angle - ENTRY_ANGLE);
  state.checks.maxProgress = Math.max(state.checks.maxProgress, progress);
}

function crossedEntryLine(p) {
  return p.py > RING_OUTER + 5 && p.y <= RING_OUTER + 5 && p.x < 5 && p.x > -ROAD_HALF;
}

function nearEntryLine(p) {
  return p.y > RING_OUTER + 5 && p.y < RING_OUTER + 95 && p.x > -ROAD_HALF && p.x < 4;
}

function unsafeTrafficFromRight() {
  for (const other of state.ai) {
    const angle = wrapAngle(other.angle);
    const approachingSouthEntry = angle > 0.05 && angle < 1.3;
    if (approachingSouthEntry) return true;
  }
  return false;
}

function onWrongSideOfSouthApproach(x, y) {
  return y > RING_OUTER + 30 && Math.abs(x) < ROAD_HALF && x > 4;
}

function isOnRoad(x, y) {
  const r = Math.hypot(x, y);
  const onRing = r >= RING_INNER && r <= RING_OUTER;
  const onVertical = Math.abs(x) <= ROAD_HALF && Math.abs(y) >= RING_INNER;
  const onHorizontal = Math.abs(y) <= ROAD_HALF && Math.abs(x) >= RING_INNER;
  return onRing || onVertical || onHorizontal;
}

function isOnExitRoad(x, y) {
  return Boolean(exitArmForPosition(x, y));
}

function hitsCentralIsland(x, y) {
  return Math.hypot(x, y) < RING_INNER - 4;
}

function ringLane(x, y) {
  const r = Math.hypot(x, y);
  if (r < RING_INNER || r > RING_OUTER) return null;
  return r < LANE_SPLIT_RADIUS ? "inner" : "outer";
}

function southApproachLane(x, y) {
  if (y < RING_OUTER || Math.abs(x) > ROAD_HALF) return "none";
  if (x < -36) return "left";
  if (x < 3) return "right";
  return "opposing";
}

function exitArmForPosition(x, y) {
  if (x < -RING_OUTER && Math.abs(y) < ROAD_HALF) return "west";
  if (x > RING_OUTER && Math.abs(y) < ROAD_HALF) return "east";
  if (y < -RING_OUTER && Math.abs(x) < ROAD_HALF) return "north";
  if (y > RING_OUTER && Math.abs(x) < ROAD_HALF) return "south";
  return null;
}

function exitRoadWrongSide(x, y, arm) {
  if (arm === "west") return y < 4;
  if (arm === "east") return y > -4;
  if (arm === "north") return x > -4;
  if (arm === "south") return x < 4;
  return false;
}

function trafficPosition(car) {
  return {
    x: Math.cos(car.angle) * car.radius,
    y: Math.sin(car.angle) * car.radius,
    heading: car.angle + Math.PI / 2,
  };
}

function draw() {
  ctx.clearRect(0, 0, view.w, view.h);
  drawBackdrop();
  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.scale, view.scale);
  drawWorld();
  ctx.restore();
}

function drawBackdrop() {
  const gradient = ctx.createLinearGradient(0, 0, view.w, view.h);
  gradient.addColorStop(0, "#1b513e");
  gradient.addColorStop(0.54, "#17382e");
  gradient.addColorStop(1, "#213c2c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.w, view.h);
}

function drawWorld() {
  drawScenery();
  drawRoads();
  drawRouteGuide();
  drawLearningCallout();
  drawRoadFurniture();
  drawTraffic();
  drawPlayer();
}

function drawScenery() {
  for (const item of scenery) {
    ctx.beginPath();
    ctx.fillStyle = item.color;
    ctx.arc(item.x, item.y, item.r, 0, TAU);
    ctx.fill();
  }
}

function drawRoads() {
  ctx.save();
  ctx.fillStyle = "#343a3f";
  ctx.fillRect(-ROAD_HALF, -WORLD_LIMIT, ROAD_HALF * 2, WORLD_LIMIT * 2);
  ctx.fillRect(-WORLD_LIMIT, -ROAD_HALF, WORLD_LIMIT * 2, ROAD_HALF * 2);

  ctx.beginPath();
  ctx.arc(0, 0, RING_OUTER, 0, TAU);
  ctx.arc(0, 0, RING_INNER, 0, TAU, true);
  ctx.fillStyle = "#3b4146";
  ctx.fill("evenodd");

  drawRoadTexture();
  drawKerbs();
  drawLaneLines();
  drawGiveWayLines();
  drawRoadArrows();
  drawCentralIsland();
  ctx.restore();
}

function drawRoadTexture() {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#22272a";
  ctx.lineWidth = 1;
  for (let i = -900; i <= 900; i += 36) {
    ctx.beginPath();
    ctx.moveTo(-ROAD_HALF, i);
    ctx.lineTo(ROAD_HALF, i + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, -ROAD_HALF);
    ctx.lineTo(i + 20, ROAD_HALF);
    ctx.stroke();
  }
  ctx.restore();
}

function drawKerbs() {
  ctx.save();
  ctx.strokeStyle = "#f4f1e8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, RING_OUTER, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, RING_INNER, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = "rgba(244, 241, 232, 0.9)";
  line(-ROAD_HALF, -WORLD_LIMIT, -ROAD_HALF, -RING_OUTER + 8);
  line(ROAD_HALF, -WORLD_LIMIT, ROAD_HALF, -RING_OUTER + 8);
  line(-ROAD_HALF, RING_OUTER - 8, -ROAD_HALF, WORLD_LIMIT);
  line(ROAD_HALF, RING_OUTER - 8, ROAD_HALF, WORLD_LIMIT);
  line(-WORLD_LIMIT, -ROAD_HALF, -RING_OUTER + 8, -ROAD_HALF);
  line(-WORLD_LIMIT, ROAD_HALF, -RING_OUTER + 8, ROAD_HALF);
  line(RING_OUTER - 8, -ROAD_HALF, WORLD_LIMIT, -ROAD_HALF);
  line(RING_OUTER - 8, ROAD_HALF, WORLD_LIMIT, ROAD_HALF);
  ctx.restore();
}

function drawLaneLines() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([18, 18]);
  ctx.beginPath();
  ctx.arc(0, 0, LANE_SPLIT_RADIUS, 0, TAU);
  ctx.stroke();

  line(-30, RING_OUTER + 16, -30, WORLD_LIMIT);
  line(30, -WORLD_LIMIT, 30, -RING_OUTER - 16);
  line(-WORLD_LIMIT, 30, -RING_OUTER - 16, 30);
  line(RING_OUTER + 16, -30, WORLD_LIMIT, -30);

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
  ctx.lineWidth = 3;
  line(0, RING_OUTER + 12, 0, WORLD_LIMIT);
  line(0, -WORLD_LIMIT, 0, -RING_OUTER - 12);
  line(-WORLD_LIMIT, 0, -RING_OUTER - 12, 0);
  line(RING_OUTER + 12, 0, WORLD_LIMIT, 0);
  ctx.restore();
}

function drawGiveWayLines() {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  line(-ROAD_HALF + 8, RING_OUTER + 7, 0, RING_OUTER + 7);
  line(0, -RING_OUTER - 7, ROAD_HALF - 8, -RING_OUTER - 7);
  line(-RING_OUTER - 7, -ROAD_HALF + 8, -RING_OUTER - 7, 0);
  line(RING_OUTER + 7, 0, RING_OUTER + 7, ROAD_HALF - 8);
  ctx.setLineDash([]);

  drawGiveWayTeeth("south");
  drawGiveWayTeeth("north");
  drawGiveWayTeeth("west");
  drawGiveWayTeeth("east");
  ctx.restore();
}

function drawGiveWayTeeth(arm) {
  const count = 3;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    if (arm === "south") {
      const x = -60 + i * 23;
      const y = RING_OUTER + 15;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 11, y + 18);
      ctx.lineTo(x + 22, y);
    } else if (arm === "north") {
      const x = 4 + i * 23;
      const y = -RING_OUTER - 15;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 11, y - 18);
      ctx.lineTo(x + 22, y);
    } else if (arm === "west") {
      const x = -RING_OUTER - 15;
      const y = -60 + i * 23;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 18, y + 11);
      ctx.lineTo(x, y + 22);
    } else {
      const x = RING_OUTER + 15;
      const y = 4 + i * 23;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y + 11);
      ctx.lineTo(x, y + 22);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawRoadArrows() {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 6;
  drawArrow(-52, 390, -Math.PI / 2, "left");
  drawArrow(-20, 390, -Math.PI / 2, "right");
  drawArrow(48, -390, Math.PI / 2, "ahead");
  drawArrow(-390, -48, 0, "ahead");
  drawArrow(390, 48, Math.PI, "ahead");
  ctx.restore();
}

function drawArrow(x, y, heading, turn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(0, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(-12, -22);
  ctx.lineTo(12, -22);
  ctx.closePath();
  ctx.fill();
  if (turn === "left") {
    ctx.beginPath();
    ctx.arc(-22, -16, 22, -0.08, -Math.PI * 0.78, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-44, -20);
    ctx.lineTo(-26, -32);
    ctx.lineTo(-30, -10);
    ctx.closePath();
    ctx.fill();
  }
  if (turn === "right") {
    ctx.beginPath();
    ctx.arc(22, -16, 22, Math.PI + 0.08, Math.PI * 1.78, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(44, -20);
    ctx.lineTo(26, -32);
    ctx.lineTo(30, -10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawCentralIsland() {
  ctx.save();
  const grad = ctx.createRadialGradient(-20, -25, 10, 0, 0, RING_INNER);
  grad.addColorStop(0, "#5fa36e");
  grad.addColorStop(1, "#2f6a4f");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, RING_INNER - 7, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, RING_INNER - 18, 0.12, TAU - 0.12);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "700 16px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LOOK", 0, -8);
  ctx.fillText("RIGHT", 0, 14);
  ctx.restore();
}

function drawRoadFurniture() {
  drawBlueSign(-115, 300, "GIVE WAY");
  drawBlueSign(114, -300, "GIVE WAY");
  drawExitLabel(-326, 96, "1st exit");
  drawExitLabel(-92, -328, "2nd");
  drawExitLabel(316, -96, "3rd");
  drawExitLabel(96, 314, "start");
}

function drawBlueSign(x, y, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#d8e3ea";
  ctx.lineWidth = 3;
  line(0, 28, 0, 74);
  ctx.fillStyle = "#175ca8";
  roundRect(-44, -18, 88, 46, 7);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 0);
  ctx.beginPath();
  ctx.arc(0, 9, 9, 0.1, TAU * 0.85);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawExitLabel(x, y, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(-38, -16, 76, 28, 5);
  ctx.fill();
  ctx.fillStyle = "#eaf1eb";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 3);
  ctx.restore();
}

function drawRouteGuide() {
  if (state.mode !== "guided" || state.completedAt) return;
  const scenario = currentScenario();
  const radius = scenario.ringLane === "inner" ? 121 : 162;
  const startX = scenario.approachLane === "left" ? -50 : -18;
  const target = ENTRY_ANGLE + scenario.exitIndex * (Math.PI / 2);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 209, 102, 0.72)";
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.setLineDash([24, 20]);
  line(startX, 615, startX, RING_OUTER + 20);
  ctx.beginPath();
  ctx.arc(0, 0, radius, ENTRY_ANGLE, target, false);
  ctx.stroke();

  const exit = exitGuideLine(scenario.exitArm, radius);
  line(exit.x1, exit.y1, exit.x2, exit.y2);
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(104, 183, 255, 0.9)";
  ctx.lineWidth = 3;
  line(startX, 615, startX, RING_OUTER + 20);
  ctx.beginPath();
  ctx.arc(0, 0, radius, ENTRY_ANGLE, target, false);
  ctx.stroke();
  line(exit.x1, exit.y1, exit.x2, exit.y2);
  ctx.restore();
}

function drawLearningCallout() {
  if (state.mode !== "guided") return;
  const guidance = guidanceState();
  if (!guidance.tag) return;

  ctx.save();
  const text = guidance.tag.text;
  ctx.font = "900 15px Inter, sans-serif";
  const width = Math.max(92, ctx.measureText(text).width + 28);
  const height = 38;
  const x = guidance.tag.x - width / 2;
  const y = guidance.tag.y - height / 2;
  ctx.fillStyle = guidance.tone === "warn" ? "rgba(255, 209, 102, 0.94)" : "rgba(104, 183, 255, 0.92)";
  roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.fillStyle = "#172018";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, guidance.tag.x, guidance.tag.y + 1);
  ctx.restore();
}

function exitGuideLine(arm, radius) {
  if (arm === "west") return { x1: -radius, y1: 44, x2: -600, y2: 44 };
  if (arm === "north") return { x1: -44, y1: -radius, x2: -44, y2: -600 };
  if (arm === "east") return { x1: radius, y1: -44, x2: 600, y2: -44 };
  return { x1: 44, y1: radius, x2: 44, y2: 600 };
}

function drawTraffic() {
  for (const car of state.ai) {
    const pos = trafficPosition(car);
    drawVehicle(pos.x, pos.y, pos.heading, car.type === "cycle" ? 24 : 36, car.type === "van" ? 22 : 18, car.color, {
      ai: true,
      cycle: car.type === "cycle",
    });
  }
}

function drawPlayer() {
  const blink = Math.floor(state.time * 4) % 2 === 0;
  drawVehicle(state.player.x, state.player.y, state.player.heading, state.player.length, state.player.width, "#ff4d5d", {
    player: true,
    signal: blink ? state.signal : "none",
  });
}

function drawVehicle(x, y, heading, length, width, color, options = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  if (options.cycle) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-7, 0, 6, 0, TAU);
    ctx.arc(9, 0, 6, 0, TAU);
    ctx.moveTo(-7, 0);
    ctx.lineTo(1, -7);
    ctx.lineTo(9, 0);
    ctx.moveTo(1, -7);
    ctx.lineTo(1, -13);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = options.player ? 16 : 8;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = color;
  roundRect(-length / 2, -width / 2, length, width, 5);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  roundRect(length * 0.05, -width / 2 + 3, length * 0.25, width - 6, 3);
  ctx.fill();

  ctx.fillStyle = "#f8f5c4";
  ctx.fillRect(length / 2 - 3, -width / 2 + 3, 3, 5);
  ctx.fillRect(length / 2 - 3, width / 2 - 8, 3, 5);

  if (options.signal === "left") {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(length / 2 - 3, -width / 2 - 3, 5, 4);
    ctx.fillRect(-length / 2 - 2, -width / 2 - 3, 5, 4);
  }
  if (options.signal === "right") {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(length / 2 - 3, width / 2 - 1, 5, 4);
    ctx.fillRect(-length / 2 - 2, width / 2 - 1, 5, 4);
  }

  if (options.player) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(length / 2 + 8, 0);
    ctx.lineTo(length / 2 + 18, 0);
    ctx.stroke();
  }

  ctx.restore();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle) {
  let wrapped = angle % TAU;
  if (wrapped < 0) wrapped += TAU;
  return wrapped;
}

function loop(now) {
  const dt = Math.min(0.04, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
bindControls();
resize();
resetDrill(false);
requestAnimationFrame(loop);
