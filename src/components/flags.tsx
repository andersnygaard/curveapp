export function NorwegianFlag() {
  return (
    <svg viewBox="0 0 22 16" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="22" height="16" fill="#ba0c2f" />
      <path d="M8 0v16M0 8h22" stroke="#fff" strokeWidth="4" />
      <path d="M8 0v16M0 8h22" stroke="#00205b" strokeWidth="2" />
    </svg>
  );
}

export function BritishFlag() {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <clipPath id="british-flag-diagonals">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#c8102e" strokeWidth="4" clipPath="url(#british-flag-diagonals)" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}
