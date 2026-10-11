// How skill tags and answer chips read on screen. Display only: stored tags,
// search values and what a chip sends stay exactly as they are.
//
//   skillLabel('computer vision')  // 'Computer Vision'
//   skillLabel('ML'), skillLabel('LoRa')  // unchanged: a word with a capital is written on purpose
//   choiceLabel('Something else')  // unchanged: only all-lowercase chips are tags

// Lowercase words that are written another way.
const WORDS = {
  ai: 'AI', ml: 'ML', ui: 'UI', ux: 'UX', api: 'API', apis: 'APIs', ar: 'AR', vr: 'VR', xr: 'XR',
  '2d': '2D', '3d': '3D', iot: 'IoT', ios: 'iOS', nlp: 'NLP', llm: 'LLM', llms: 'LLMs', rag: 'RAG',
  gis: 'GIS', sql: 'SQL', css: 'CSS', html: 'HTML', js: 'JS', aws: 'AWS', gcp: 'GCP', cv: 'CV',
  mlops: 'MLOps', devops: 'DevOps', esp32: 'ESP32', mqtt: 'MQTT', lora: 'LoRa', web3: 'Web3',
  'ci/cd': 'CI/CD', 'ar/vr': 'AR/VR', dsp: 'DSP', pcb: 'PCB', gpu: 'GPU', etl: 'ETL', jwt: 'JWT',
  oauth: 'OAuth', graphql: 'GraphQL', javascript: 'JavaScript', typescript: 'TypeScript',
  github: 'GitHub', pytorch: 'PyTorch', tensorflow: 'TensorFlow', opencv: 'OpenCV', fastapi: 'FastAPI',
  mongodb: 'MongoDB', mysql: 'MySQL', postgresql: 'PostgreSQL', webgl: 'WebGL', webrtc: 'WebRTC',
  webxr: 'WebXR', swiftui: 'SwiftUI', wcag: 'WCAG', ble: 'BLE',
};
// Names that are lowercase on purpose.
const AS_WRITTEN = new Set(['dbt', 'ggplot2', 'scikit-learn', 'statsmodels', 'npm', 'pnpm', 'a11y']);
// Short joining words stay lowercase inside a label.
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);
const CAPITAL = /\p{Lu}/u;

export function skillLabel(tag) {
  if (typeof tag !== 'string') return tag;
  const text = tag.trim();
  if (AS_WRITTEN.has(text)) return text;
  return text.split(/(\s+)/).map((word, i) => {
    if (!word.trim() || CAPITAL.test(word)) return word;
    if (Object.hasOwn(WORDS, word)) return WORDS[word];
    if (i > 0 && SMALL.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}

// ask_with_options chips: an all-lowercase chip is a tag ("computer vision"); anything
// with a capital is already written for people ("Something else", "Frontend & UI").
export function choiceLabel(option) {
  return typeof option === 'string' && option === option.toLowerCase() ? skillLabel(option) : option;
}
