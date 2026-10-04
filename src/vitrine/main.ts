import '@fontsource-variable/inter/wght.css';
import '@/styles/tokens.css';
import './vitrine.css';

/* Vitrine : page statique. Le bouton « Demander une présentation » n'apparaît que si une adresse de contact
   est configurée (VITE_CONTACT_EMAIL, publique par nature : elle figure dans la page). */

const email = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim();
if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  const subject = encodeURIComponent('Présentation de Routine');
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-contact]')) {
    link.href = `mailto:${email}?subject=${subject}`;
    link.hidden = false;
  }
}
