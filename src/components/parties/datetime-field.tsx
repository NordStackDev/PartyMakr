"use client";

import { useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { da } from "date-fns/locale/da";

registerLocale("da", da);

// On phones the text input would pop the on-screen keyboard underneath the
// calendar overlay. Blur immediately on touch devices so only the picker is
// used; desktop keeps manual typing.
function blurOnTouch(e: React.FocusEvent<HTMLInputElement>) {
  if (window.matchMedia("(pointer: coarse)").matches) e.target.blur();
}

/**
 * Danish datetime picker (dd/MM/yyyy HH:mm). Emits an ISO string in a hidden
 * input so the server action can `new Date(...)` it. Uses a portal so the
 * calendar isn't clipped by the phone-frame card's overflow.
 */
export function DateTimeField({
  name,
  defaultValue,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [date, setDate] = useState<Date | null>(
    defaultValue ? new Date(defaultValue) : null,
  );

  return (
    <>
      <DatePicker
        selected={date}
        onChange={setDate}
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={15}
        timeCaption="Tid"
        dateFormat="dd/MM/yyyy HH:mm"
        locale="da"
        placeholderText="Vælg dato og tid"
        wrapperClassName="block w-full"
        className="auth-input"
        required={required}
        withPortal
        onFocus={blurOnTouch}
      />
      <input
        type="hidden"
        name={name}
        value={date ? date.toISOString() : ""}
      />
    </>
  );
}
