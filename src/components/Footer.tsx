import { useTranslations } from '../i18n';

export default function Footer() {
  const t = useTranslations();
  return (
    <footer className="footer">
      <span>Curve</span>
      <span>{t.privacyStatement}</span>
    </footer>
  );
}
