import React, { useCallback, useState } from "react";
import AboutCxAsCode from "./AboutCxAsCode.jsx";

const EASTER_EGG_QUIPS = [
  "Because depends_on is a lifestyle.",
  "Dependencies happen.",
  "If it's cyclic, blame the graph.",
  "Plan first. -auto-approve never.",
  "Still faster than clicking through Admin.",
  "terraform apply — please be gentle.",
  "Division-aware and proud.",
  "It's resources all the way down.",
  "genesyscloud_tf_export enthusiast.",
  "Your tfstate has opinions.",
  "Reading the changelog so you don't have to.",
  "Dependency graph, but make it browsable.",
  "Export behavior is a social construct.",
  "Not an official Genesys panic button.",
  "Built for people who read error messages.",
  "Registry docs are one click away. You're welcome.",
  "Somewhere, a flow depends on twelve other things.",
];

const COLOR_CYCLE_SECONDS = 6;
const COLOR_CYCLE_STEPS = 8;

function pickColorPhase() {
  return Math.floor(Math.random() * COLOR_CYCLE_STEPS);
}

function colorCycleDelay(phase) {
  return `-${(phase / COLOR_CYCLE_STEPS) * COLOR_CYCLE_SECONDS}s`;
}

function pickQuip(previous) {
  if (EASTER_EGG_QUIPS.length <= 1) return EASTER_EGG_QUIPS[0] || "";

  let next = previous;
  while (next === previous) {
    next = EASTER_EGG_QUIPS[Math.floor(Math.random() * EASTER_EGG_QUIPS.length)];
  }
  return next;
}

export default function PageTitle() {
  const [quip, setQuip] = useState("");
  const [colorPhase, setColorPhase] = useState(0);

  const handleEnter = useCallback(() => {
    setColorPhase(pickColorPhase());
    setQuip((previous) => pickQuip(previous));
  }, []);

  const handleLeave = useCallback(() => {
    setQuip("");
  }, []);

  return (
    <div className="gcPageTitleGroup">
      <h1
        className="gcPageTitle gcPageTitleEgg"
        style={{ "--gc-page-title-color-delay": colorCycleDelay(colorPhase) }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        CX as Code Explorer
      </h1>
      <AboutCxAsCode />
      {quip ? (
        <p className="gcPageTitleEgg__quip" aria-hidden="true">
          {quip}
        </p>
      ) : null}
    </div>
  );
}
