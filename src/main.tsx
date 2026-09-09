/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { installDesktopLinks } from './platform/files';

installDesktopLinks();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
