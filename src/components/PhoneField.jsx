import React from "react";
import { Phone } from "lucide-react";
import { PHONE_PREFIX, phoneFromLocal, phoneLocalDigits } from "../lib/utils.js";

export default function PhoneField({ id, name, value, onChange, autoComplete = "tel", placeholder = "912 345 678" }) {
  return (
    <div className="input-group ws-phone">
      <span className="input-group-text ws-phone-prefix">
        <Phone size={15} aria-hidden="true" />
        <span>{PHONE_PREFIX}</span>
      </span>
      <input
        id={id}
        name={name}
        className="form-control ws-phone-input"
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={9}
        placeholder={placeholder}
        value={phoneLocalDigits(value)}
        onChange={(event) => onChange(phoneFromLocal(event.target.value))}
      />
    </div>
  );
}
