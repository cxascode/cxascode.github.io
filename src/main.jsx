import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

import { registerElements } from "genesys-spark-components";
registerElements(); // required so <gux-*> components work in the browser  [oai_citation:1‡GitHub](https://github.com/MyPureCloud/genesys-spark/blob/main/packages/genesys-spark-components-react/README.md?utm_source=chatgpt.com)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);