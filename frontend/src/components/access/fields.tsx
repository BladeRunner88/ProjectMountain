import type { ReactNode } from 'react'
import { COUNTRIES } from '../../lib/countries'

const ERROR_COLOR = '#C7392B'

const inputBase =
  'w-full rounded-[10px] border bg-white p-[14px] text-[17px] text-ink placeholder:text-ink-faint focus:outline-none transition-colors duration-fast ease-out'

function borderClass(error?: string) {
  return error ? '' : 'border-hairline focus:border-accent'
}

function borderStyle(error?: string) {
  return error ? { borderColor: ERROR_COLOR } : undefined
}

function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[14px] font-medium text-ink">
      {children}
    </label>
  )
}

export function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return (
    <p className="mt-1.5 text-[13px]" style={{ color: ERROR_COLOR }}>
      {error}
    </p>
  )
}

type TextFieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  placeholder?: string
  type?: string
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  type = 'text',
}: TextFieldProps) {
  const id = slugify(label)
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`mt-2 ${inputBase} ${borderClass(error)}`}
        style={borderStyle(error)}
      />
      <FieldError error={error} />
    </div>
  )
}

type TextareaFieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  placeholder?: string
  minLength: number
}

export function TextareaField({
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  minLength,
}: TextareaFieldProps) {
  const id = slugify(label)
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={5}
        className={`mt-2 resize-none ${inputBase} ${borderClass(error)}`}
        style={borderStyle(error)}
      />
      <p className="mt-1.5 text-[13px] text-ink-faint">
        {value.length} characters. {minLength} minimum.
      </p>
      <FieldError error={error} />
    </div>
  )
}

type SelectFieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  options: string[]
  placeholder?: string
}

export function SelectField({
  label,
  value,
  onChange,
  onBlur,
  error,
  options,
  placeholder = 'Select',
}: SelectFieldProps) {
  const id = slugify(label)
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative mt-2">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`appearance-none pr-10 ${inputBase} ${borderClass(error)} ${value === '' ? 'text-ink-faint' : ''}`}
          style={borderStyle(error)}
        >
          <option value="" disabled hidden>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o} value={o} className="text-ink">
              {o}
            </option>
          ))}
        </select>
        <Chevron />
      </div>
      <FieldError error={error} />
    </div>
  )
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
    >
      <path
        d="M1 1L5 5L9 1"
        stroke="#98989D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type PhoneFieldProps = {
  label: string
  dial: string
  onDialChange: (v: string) => void
  number: string
  onNumberChange: (v: string) => void
  onBlur?: () => void
  error?: string
}

export function PhoneField({
  label,
  dial,
  onDialChange,
  number,
  onNumberChange,
  onBlur,
  error,
}: PhoneFieldProps) {
  const id = slugify(label)
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div
        className={`mt-2 flex overflow-hidden rounded-[10px] border transition-colors duration-fast ease-out ${
          error ? '' : 'border-hairline focus-within:border-accent'
        }`}
        style={borderStyle(error)}
      >
        <div className="relative shrink-0 border-r border-hairline">
          <select
            value={dial}
            onChange={(e) => onDialChange(e.target.value)}
            className="appearance-none bg-white py-[14px] pl-[14px] pr-8 text-[17px] text-ink focus:outline-none"
          >
            {COUNTRIES.map((c) => (
              <option key={`${c.name}-${c.dial}`} value={c.dial}>
                {c.dial}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
        <input
          id={id}
          type="tel"
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          onBlur={onBlur}
          placeholder="555 123 4567"
          className="w-full bg-white p-[14px] text-[17px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      <FieldError error={error} />
    </div>
  )
}

type MultiSelectFieldProps = {
  label: string
  options: string[]
  selected: string[]
  onToggle: (option: string) => void
  error?: string
  otherValue?: string
  onOtherChange?: (v: string) => void
}

export function MultiSelectField({
  label,
  options,
  selected,
  onToggle,
  error,
  otherValue,
  onOtherChange,
}: MultiSelectFieldProps) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div
        className={`mt-2 overflow-hidden rounded-[10px] border ${error ? '' : 'border-hairline'}`}
        style={borderStyle(error)}
      >
        {options.map((opt, i) => {
          const checked = selected.includes(opt)
          return (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-3 bg-white px-[14px] py-3 ${
                i === 0 ? '' : 'border-t border-hairline'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-fast ease-out ${
                  checked ? 'border-accent bg-accent' : 'border-hairline'
                }`}
              >
                {checked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="text-[15px] text-ink">{opt}</span>
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggle(opt)} />
            </label>
          )
        })}
      </div>
      {selected.includes('Other') && onOtherChange && (
        <input
          type="text"
          value={otherValue ?? ''}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Tell us more"
          className={`mt-2 ${inputBase} border-hairline focus:border-accent`}
        />
      )}
      <FieldError error={error} />
    </div>
  )
}
