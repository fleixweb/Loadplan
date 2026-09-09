/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import { Container } from 'lucide-react';

export const BrandIcon = Container;

export default function Brand() {
  return (
    <a href="#" className="brand" aria-label="柜算首页">
      <span className="brand-symbol"><BrandIcon size={24} strokeWidth={1.7} /></span>
      <strong>柜算<span>LOADPLAN</span></strong>
    </a>
  );
}
