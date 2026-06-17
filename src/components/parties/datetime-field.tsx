"use client";

import { useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { da } from "date-fns/locale/da";

registerLocale("da", da);

/**
 * Danish datetime picker (dd/MM/yyyy HH:mm). Emits an ISO string in a hidden
 * input so the server action can `new Date(...)` it. Uses a portal so the
 * calendar isn't clipped by the phone-frame card's overflow.
 */
export function DateTimeField({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
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
        withPortal
      />
      <input
        type="hidden"
        name={name}
        value={date ? date.toISOString() : ""}
      />
    </>
  );
}
