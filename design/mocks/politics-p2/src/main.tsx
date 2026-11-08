import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The slice-4 config first: modules below read POLITICS when they load.
import "./slice4-config";
import App from "./App";
import "./mock.css";
// The browser half of the review loop: without it nothing is selectable.
import "../review-loop/select-client";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
