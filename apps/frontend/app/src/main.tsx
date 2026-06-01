import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import App from "./app/app";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Missing required root element with id "root".');
}

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
