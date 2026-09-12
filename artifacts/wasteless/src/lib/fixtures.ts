import type { IdentifiedAnalysis, UnidentifiedAnalysis } from '@workspace/api-client-react';

function assertIdentified(data: IdentifiedAnalysis, label: string): IdentifiedAnalysis {
  const types = data.other_options.map((option) => option.type);
  if (data.steps.length < 3 || data.steps.length > 5) {
    throw new Error(`${label} must have 3-5 steps`);
  }
  if (data.other_options.length !== 3 || data.creative_ideas.length !== 3) {
    throw new Error(`${label} must have exactly 3 alternatives and ideas`);
  }
  if (new Set(types).size !== 3 || types.includes(data.best_option)) {
    throw new Error(`${label} has invalid other_options`);
  }
  return data;
}

export type SampleId = 'chair' | 'jar' | 'battery' | 'unknown';

export const SAMPLE_RESULTS: Record<
  Exclude<SampleId, 'unknown'>,
  IdentifiedAnalysis
> & { unknown: UnidentifiedAnalysis } = {
  chair: {
    identified: true,
    item: 'wooden chair',
    material: 'wood with mixed fasteners',
    best_option: 'reuse',
    reason: 'A chair that still looks usable should stay in a home, not go to landfill.',
    condition_check: {
      question: 'Is the frame sound, with no wobble, broken joints, or loose legs?',
      if_good: 'Keep using it, or offer it to a furniture bank or community centre.',
      if_bad: 'Do not let someone sit on it. Salvage sound wood or use bulky-waste recycling.',
    },
    steps: [
      'Press on the seat and try each leg for movement.',
      'Tighten visible screws or bolts if they turn easily.',
      'Wipe dust and check for splinters or protruding hardware.',
      'Keep it, or list a sound chair with a furniture bank.',
    ],
    other_options: [
      {
        type: 'donate',
        title: 'Offer it to a furniture bank',
        note: 'Furniture banks want clean, sturdy seating that someone can use immediately.',
      },
      {
        type: 'sell',
        title: 'Sell a sound chair',
        note: 'A local listing works when the chair is clean and does not wobble.',
      },
      {
        type: 'recycle',
        title: 'Use bulky-waste recycling',
        note: 'If the frame has failed, separate wood and metal at a civic amenity site.',
      },
    ],
    creative_ideas: [
      { title: 'Use it as a plant stand or hallway perch', effort: 'easy' },
      { title: 'Sand and oil a sound wooden frame', effort: 'medium' },
      { title: 'Reupholster the seat if the frame is solid', effort: 'involved' },
    ],
    recipient_type: 'furniture bank',
    warning: null,
  },
  jar: {
    identified: true,
    item: 'glass jar',
    material: 'glass',
    best_option: 'reuse',
    reason: 'A sound jar is one of the easiest household objects to keep in daily use.',
    condition_check: {
      question: 'Is it free from cracks, and can you wash out every trace of what it held?',
      if_good: 'Wash it and keep it for dry food, leftovers, or small storage.',
      if_bad: 'Do not store food in it. Recycle the glass if your service accepts jars.',
    },
    steps: [
      'Check the rim and body for chips or hairline cracks.',
      'Wash with hot soapy water if it held food.',
      'Keep the lid if it seals; recycle metal lids separately when needed.',
      'Reuse it for dry goods before you put it in glass recycling.',
    ],
    other_options: [
      {
        type: 'donate',
        title: 'Pass clean jars to a kitchen',
        note: 'Community kitchens and some schools welcome clean, unmarked jars.',
      },
      {
        type: 'sell',
        title: 'Sell only distinctive bottles',
        note: 'An ordinary jam jar rarely sells; an unusual bottle might.',
      },
      {
        type: 'recycle',
        title: 'Use glass recycling',
        note: 'Rinse it first. Do not bag glass unless your collection asks you to.',
      },
    ],
    creative_ideas: [
      { title: 'Use it for dry pantry storage', effort: 'easy' },
      { title: 'Make a simple desk organiser', effort: 'medium' },
      { title: 'Turn it into a small vase', effort: 'involved' },
    ],
    recipient_type: 'community kitchen or school',
    warning:
      'Do not reuse a jar that held chemicals, paint, medicine, or anything you cannot identify. Residue can remain after washing and is not always visible.',
  },
  battery: {
    identified: true,
    item: 'lithium battery',
    material: 'lithium-ion cell',
    best_option: 'recycle',
    reason: 'Lithium batteries must go to a dedicated collection point, never household waste.',
    condition_check: {
      question: 'Is the battery intact, with no leaking, swelling, heat, or puncture?',
      if_good: 'Take it to a battery or household-hazardous-waste collection point without opening it.',
      if_bad:
        'Do not put it in a bin, pocket, or bag with keys. Place it in a non-metal container and use a hazardous-waste drop-off.',
    },
    steps: [
      'Do not throw the battery in household waste, recycling, or a fire.',
      'Tape the terminals if they are exposed.',
      'Keep it dry and away from metal objects.',
      'Take it to a battery collection point or household-hazardous-waste site.',
    ],
    other_options: [
      {
        type: 'reuse',
        title: 'Do not reuse a used lithium cell',
        note: 'Recharging, prying open, or fitting an unknown cell into another device is unsafe.',
      },
      {
        type: 'donate',
        title: 'Do not donate used cells',
        note: 'Charity shops and schools cannot take loose or used lithium batteries.',
      },
      {
        type: 'sell',
        title: 'Do not sell used cells',
        note: 'Used lithium batteries are a fire risk in the post and in transit.',
      },
    ],
    creative_ideas: [
      { title: 'Collect household cells for one drop-off trip', effort: 'easy' },
      { title: 'Ask the shop that sold the device about take-back', effort: 'medium' },
      { title: 'Switch later devices to a proper rechargeable pack', effort: 'involved' },
    ],
    recipient_type: null,
    warning:
      'Lithium batteries can ignite if crushed, shorted, or thrown in household waste. Do not open, charge, puncture, or incinerate this cell.',
  },
  unknown: {
    identified: false,
    reason: 'I am not sure what this is. Try another photo with better lighting or a closer view.',
  },
};

export const SAMPLE_META: Array<{ id: SampleId; label: string; note: string }> = [
  { id: 'chair', label: 'Chair', note: 'Reuse path' },
  { id: 'jar', label: 'Glass jar', note: 'Contamination warning' },
  { id: 'battery', label: 'Lithium battery', note: 'Safety warning' },
  { id: 'unknown', label: 'Unclear photo', note: 'Unknown state' },
];

assertIdentified(SAMPLE_RESULTS.chair, 'chair');
assertIdentified(SAMPLE_RESULTS.jar, 'jar');
assertIdentified(SAMPLE_RESULTS.battery, 'battery');
