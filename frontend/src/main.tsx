import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RootApp from "./RootApp";
import "./theme/theme.css";
import "./theme/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
