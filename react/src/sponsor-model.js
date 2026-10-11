import { topicsIn } from './event-model.js';

// Reuse the event topic vocabulary, with the extra concepts sponsors can help with.
// A language by itself is a coding signal, not proof that the project uses AI.
const sponsorTopics = text => {
  const value = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return [
    ...topicsIn(value),
    ...(/\b(python|java|c\+\+|c#|rust|go|golang|solidity|programming|coding|software|programacion)(?![\w+#])/.test(value) ? ['coding'] : []),
    ...(/\b(back[ -]?end|full[ -]?stack|databases?|postgres(ql)?|sql|bases? de datos)\b/.test(value) ? ['backend'] : []),
    ...(/\b(climate|carbon|sustainab\w*|environment\w*|social impact|social good|nonprofit|accessibility|healthcare|salud|sostenib\w*|medio ambiente|impacto social|accesibilidad)\b/.test(value) ? ['impact'] : []),
    ...(/\b(inteligencia artificial|aprendizaje automatico)\b/.test(value) ? ['ai'] : []),
    ...(/\b(diseno|interfaces?)\b/.test(value) ? ['design'] : []),
    ...(/\b(nube)\b/.test(value) ? ['cloud'] : []),
    ...(/\b(datos|analitica)\b/.test(value) ? ['data'] : []),
    ...(/\b(videojuegos?|juegos?|simulacion)\b/.test(value) ? ['game'] : []),
  ];
};

// Read current editable fields. The generated summary may describe an older profile.
// Names, avatars and personal links are not evidence of a sponsor fit.
export function sponsorMatch(sponsor, profile, intake) {
  const signals = [
    [intake?.idea, 'Interests & ideas', 'your interests & ideas'],
    ...(intake?.interests || []).map(term => [term, 'Interests', `your interest in ${term}`]),
    ...(intake?.skillsWanted || []).map(term => [term, 'Skills wanted', `your search for ${term} skills`]),
    ...(intake?.skills || []).map(term => [term, 'Skills', `your ${term} skill`]),
    [profile?.bio, 'About', 'your About section'],
    [intake?.track, 'Track', `your ${intake?.track} track`],
  ];
  const evidence = signals.filter(([text]) => text && sponsorTopics(text).some(topic => sponsor.topics.includes(topic)))
    .map(([text, field, label]) => ({ field, text, reason: `Matches ${label} · ${sponsor.focus}.` }));
  const goals = intake?.motivations || [];
  if ((goals.includes('compete') || intake?.goal === 'win') && sponsor.challenge) evidence.push({ field: 'Hackathon goals', text: 'Win a prize', reason: `For your prize goal · ${sponsor.challenge}.` });
  if (goals.includes('career') && sponsor.careerFair === true) evidence.push({ field: 'Hackathon goals', text: 'Grow my career', reason: 'For your career goal · listed at the sponsor career fair.' });
  if (goals.includes('meet') && sponsor.careerFair === true) evidence.push({ field: 'Hackathon goals', text: 'Meet my people', reason: 'For your networking goal · listed at the sponsor career fair.' });
  if ((goals.includes('learn') || intake?.goal === 'learn') && sponsor.workshop) evidence.push({ field: 'Hackathon goals', text: 'Learn something', reason: 'For your learning goal · has a workshop in the guide.' });
  if (goals.includes('fun') && sponsor.topics.includes('social')) evidence.push({ field: 'Hackathon goals', text: 'Have fun', reason: `For your fun goal · ${sponsor.focus}.` });
  return { highlighted: evidence.length > 0, reason: evidence[0]?.reason || null, evidence };
}

export function sponsorDirectory(sponsors, profile, intake) {
  return sponsors.map(sponsor => ({ sponsor, ...sponsorMatch(sponsor, profile, intake) }))
    .sort((a, b) => Number(b.highlighted) - Number(a.highlighted) || a.sponsor.name.localeCompare(b.sponsor.name));
}
