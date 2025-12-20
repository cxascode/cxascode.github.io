import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

import { registerSparkComponents } from "genesys-spark";

async function bootstrap() {
  // Ensure Spark loads its scripts/styles before rendering any <gux-*> components
  await registerSparkComponents();

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();