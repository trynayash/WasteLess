import type { IdentifiedAnalysis } from '@workspace/api-client-react';

export type ItemKind =
  | 'furniture'
  | 'clothing'
  | 'electronics'
  | 'plastic'
  | 'glass'
  | 'paper'
  | 'metal'
  | 'kitchen'
  | 'battery'
  | 'other';

export type VisibleCondition = 'usable' | 'needs_repair' | 'broken' | 'unsure';
export type OptionType = IdentifiedAnalysis['best_option'];

export const ITEM_KINDS: Array<{ id: ItemKind; label: string }> = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'plastic', label: 'Plastic' },
  { id: 'glass', label: 'Glass' },
  { id: 'paper', label: 'Paper/Cardboard' },
  { id: 'metal', label: 'Metal' },
  { id: 'kitchen', label: 'Kitchen item' },
  { id: 'battery', label: 'Battery' },
  { id: 'other', label: 'Other' },
];

export const CONDITIONS: Array<{ id: VisibleCondition; label: string }> = [
  { id: 'usable', label: 'Looks usable' },
  { id: 'needs_repair', label: 'Needs repair' },
  { id: 'broken', label: 'Broken' },
  { id: 'unsure', label: 'Unsure' },
];

type OtherNotes = Record<OptionType, { title: string; note: string }>;

function others(best: OptionType, notes: OtherNotes): IdentifiedAnalysis['other_options'] {
  return (['reuse', 'donate', 'sell', 'recycle'] as const)
    .filter((type) => type !== best)
    .map((type) => ({ type, title: notes[type].title, note: notes[type].note }));
}

export function recommendFromKind(
  kind: ItemKind,
  condition: VisibleCondition = 'unsure',
): IdentifiedAnalysis {
  const broken = condition === 'broken';

  switch (kind) {
    case 'battery':
      return {
        identified: true,
        item: 'battery',
        material: 'mixed battery chemistry',
        best_option: 'recycle',
        reason: 'Used batteries belong at a dedicated collection point, not in household waste.',
        condition_check: {
          question: 'Is the battery intact, with no leaking, swelling, heat, or puncture?',
          if_good: 'Take it to a battery or household-hazardous-waste collection point without opening it.',
          if_bad: 'Do not put it in a bin, pocket, or bag with keys. Place it in a non-metal container and use a hazardous-waste drop-off.',
        },
        steps: [
          'Do not throw the battery in household waste or a fire.',
          'Tape the terminals if they are exposed.',
          'Keep it dry and away from keys or coins.',
          'Take it to a battery or household-hazardous-waste collection point.',
        ],
        other_options: others('recycle', {
          reuse: { title: 'Do not reuse damaged cells', note: 'Recharging or prying open a used cell is unsafe.' },
          donate: { title: 'Do not donate used cells', note: 'Charity shops cannot take loose or used batteries.' },
          sell: { title: 'Do not sell used cells', note: 'Used lithium cells are a fire risk in transit.' },
          recycle: { title: 'Recycle at a collection point', note: 'Use a battery drop-off, not ordinary recycling.' },
        }),
        creative_ideas: [
          { title: 'Collect household cells for one drop-off trip', effort: 'easy' },
          { title: 'Switch the device to a rechargeable pack later', effort: 'medium' },
          { title: 'Ask the shop that sold it about take-back', effort: 'involved' },
        ],
        recipient_type: null,
        warning:
          'Lithium and other batteries can ignite if crushed, shorted, or thrown in household waste. Do not open, charge, or incinerate them.',
      };

    case 'electronics':
      return {
        identified: true,
        item: 'electronic device',
        material: 'mixed electronics',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'Broken electronics should go to an e-waste point, not the household bin.'
          : 'A device that still looks usable is better kept in service than thrown away.',
        condition_check: {
          question: 'Does it power on without a damaged cable, swelling, heat, or a burning smell?',
          if_good: 'Keep using it, or pass it to someone who needs that device.',
          if_bad: 'Stop using it. Use an electronics or battery collection point instead of ordinary waste.',
        },
        steps: [
          'Unplug it and look for swelling, cracks, or heat damage.',
          'Remove any loose battery only if it lifts out without force.',
          broken
            ? 'Do not attempt a risky repair; use an e-waste collection point.'
            : 'If it works, wipe personal data before you pass it on.',
          'If it does not work, take the whole device to an electronics drop-off.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep it in use', note: 'Only if it powers on safely and has no swollen battery.' },
          donate: { title: 'Give it to a reuse programme', note: 'Some community centres accept working phones, laptops, or cables.' },
          sell: { title: 'Sell a working device', note: 'Wipe it first. Do not sell a device with a damaged battery.' },
          recycle: { title: 'Use an e-waste point', note: 'Retail take-back and civic amenity sites accept mixed electronics.' },
        }),
        creative_ideas: [
          { title: 'Use it as a dedicated kitchen or music player', effort: 'easy' },
          { title: 'Harvest a working charger or cable', effort: 'medium' },
          { title: 'Book a community repair session', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'community centre or device reuse scheme',
        warning:
          'Do not put electronics or their batteries in ordinary household waste. A photo cannot confirm that a device is safe to use.',
      };

    case 'clothing':
      return {
        identified: true,
        item: 'clothing',
        material: 'textile',
        best_option: broken ? 'recycle' : 'donate',
        reason: broken
          ? 'Worn-out textiles belong in a textile collection, not a general bin.'
          : 'Wearable clothes are more useful in a textile donation programme than in the bin.',
        condition_check: {
          question: 'Is it clean, dry, and free from mould or heavy contamination?',
          if_good:
            condition === 'needs_repair'
              ? 'Mend it if you can, or pass it to a textile donation programme.'
              : 'Donate it to a charity shop or textile donation programme.',
          if_bad: 'Do not donate soiled textiles. Use a textile recycling bank if the fabric is dry.',
        },
        steps: [
          'Check for stains, holes, and remaining wear.',
          'Wash or air it only if it is going to another person.',
          broken
            ? 'Bag dry, unusable textiles for a textile recycling bank.'
            : 'Take wearable items to a charity shop or textile donation programme.',
          'Keep wet or mouldy fabric out of donation bags.',
        ],
        other_options: others(broken ? 'recycle' : 'donate', {
          reuse: { title: 'Keep wearing or mending it', note: 'A simple repair often extends the life of a garment.' },
          donate: { title: 'Pass it to a textile programme', note: 'Charity shops and textile banks want clean, dry clothing.' },
          sell: { title: 'Sell if it is in demand', note: 'Resale only makes sense if it is clean, wearable, and wanted.' },
          recycle: { title: 'Use a textile bank', note: 'Fibre recycling is the next step when it cannot be worn.' },
        }),
        creative_ideas: [
          { title: 'Turn a worn shirt into cleaning cloths', effort: 'easy' },
          { title: 'Patch or restyle a favourite piece', effort: 'medium' },
          { title: 'Join a clothing swap', effort: 'involved' },
        ],
        recipient_type: broken ? 'textile donation programme' : 'charity shop or textile donation programme',
        warning: null,
      };

    case 'furniture':
      return {
        identified: true,
        item: 'furniture',
        material: 'wood, metal, or mixed household materials',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'Unsafe furniture should be taken apart for material recycling, not left for someone to sit on.'
          : 'A piece that still looks usable is better kept in a home than sent to landfill.',
        condition_check: {
          question: 'Is the frame sound, with no wobble, broken joints, mould, or pest damage?',
          if_good: 'Keep it, or offer it to a furniture bank or community centre.',
          if_bad: 'Do not let someone sit or sleep on it. Salvage sound parts or use bulky-waste recycling.',
        },
        steps: [
          'Test joints, legs, and any moving parts by hand.',
          'Wipe dust and look for mould or sharp hardware.',
          broken ? 'Do not donate a structurally unsafe piece.' : 'If it is sound, keep it or list it for a furniture bank.',
          'For disposal, use bulky-item collection rather than a household bin.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep it in the home', note: 'A tighten-up or new hardware can make a sound piece last.' },
          donate: { title: 'Offer it to a furniture bank', note: 'Furniture banks and community centres want clean, sturdy pieces.' },
          sell: { title: 'Sell a sound piece', note: 'Local listing works when the item is clean and structurally sound.' },
          recycle: { title: 'Use bulky-waste recycling', note: 'Wood, metal, and fabric can often be separated at a civic amenity site.' },
        }),
        creative_ideas: [
          { title: 'New use as a plant stand or side table', effort: 'easy' },
          { title: 'Sand and refinish a sound wooden piece', effort: 'medium' },
          { title: 'Reupholster a chair with a sound frame', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'furniture bank or community centre',
        warning:
          'A photo cannot confirm that furniture is structurally sound. Do not donate a piece that wobbles or has broken joints.',
      };

    case 'glass':
      return {
        identified: true,
        item: 'glass container',
        material: 'glass',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'Broken glass should go in glass recycling if your service accepts it.'
          : 'A sound jar or bottle is one of the easiest things to keep in daily use.',
        condition_check: {
          question: 'Is it free from cracks, and was it only used for food that you can wash out completely?',
          if_good: 'Wash it and keep it for storage, or recycle clean glass.',
          if_bad: 'Do not store food in a cracked or chemically stained container. Recycle the glass if accepted.',
        },
        steps: [
          'Check for chips around the rim and hairline cracks.',
          'Wash with hot soapy water if it held food.',
          broken
            ? 'Wrap sharp pieces and use glass recycling if your service accepts broken glass.'
            : 'Reuse it for dry goods, leftovers, or small storage.',
          'Leave lids in the correct stream; metal lids often recycle separately.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep it as storage', note: 'Jars work for dry food, hardware, or leftover cooking.' },
          donate: { title: 'Pass clean jars on', note: 'Some community kitchens and schools welcome clean jars.' },
          sell: { title: 'Sell only unusual pieces', note: 'Ordinary jars rarely sell; a distinctive bottle might.' },
          recycle: { title: 'Use glass recycling', note: 'Rinse it first. Do not bag glass unless your service asks you to.' },
        }),
        creative_ideas: [
          { title: 'Use it for dry pantry storage', effort: 'easy' },
          { title: 'Make a simple desk organiser', effort: 'medium' },
          { title: 'Turn a bottle into a vase or lamp kit', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'community kitchen or school',
        warning:
          'Do not reuse a jar that held chemicals, paint, medicine, or anything you cannot identify. Residue can remain after washing.',
      };

    case 'kitchen':
      return {
        identified: true,
        item: 'kitchen item',
        material: 'ceramic, metal, or mixed kitchenware',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'Damaged cookware is safer as scrap metal or ceramics recycling than as a cooking tool.'
          : 'Kitchen tools that still look usable should stay in a kitchen, not the bin.',
        condition_check: {
          question: 'Is it free from rust-through, loose handles, deep non-stick flakes, or cracks that touch food?',
          if_good: 'Wash it and keep using it, or pass it to a community kitchen.',
          if_bad:
            'Stop cooking with it. Recycle metal bodies; cracked ceramics often go to residual waste.',
        },
        steps: [
          'Look at handles, rims, and any non-stick surface.',
          'Wash it if you plan to keep or donate it.',
          broken ? 'Do not donate unsafe cookware.' : 'Keep it, or offer sound items to a community kitchen.',
          'Metal pans can often go to scrap metal at a civic amenity site.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep it in the kitchen', note: 'Everyday pots, plates, and utensils are built to last.' },
          donate: { title: 'Give it to a community kitchen', note: 'Community centres and shelters often need sound cookware.' },
          sell: { title: 'Sell distinctive pieces', note: 'Cast iron and complete sets sometimes sell locally.' },
          recycle: { title: 'Recycle the metal body', note: 'Remove loose plastic handles if you can do so safely.' },
        }),
        creative_ideas: [
          { title: 'Use a sound mug as desk storage', effort: 'easy' },
          { title: 'Turn a worn pot into a planter', effort: 'medium' },
          { title: 'Restore seasoned cast iron', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'community centre or community kitchen',
        warning: null,
      };

    case 'paper':
      return {
        identified: true,
        item: 'paper or cardboard',
        material: 'paper fibre',
        best_option: 'recycle',
        reason: 'Clean paper and cardboard belong in the paper stream once they have no further use at home.',
        condition_check: {
          question: 'Is it dry, and free from food grease, wax, or plastic lining?',
          if_good: 'Flatten it and put it in paper or cardboard recycling.',
          if_bad: 'Greasy or lined packaging often cannot be recycled. Use residual waste if your service rejects it.',
        },
        steps: [
          'Remove tape, plastic windows, and food residue if you can.',
          'Flatten boxes to save space.',
          'Keep it dry until collection day.',
          'Reuse a sturdy box at home before recycling if you still need it.',
        ],
        other_options: others('recycle', {
          reuse: { title: 'Reuse a sturdy box', note: 'Storage, moving, and posting still need sound cardboard.' },
          donate: { title: 'Offer packing boxes', note: 'Schools and community centres sometimes want clean boxes.' },
          sell: { title: 'Selling is rarely worth it', note: 'Ordinary cardboard has little resale value.' },
          recycle: { title: 'Use paper recycling', note: 'Clean, dry fibre is straightforward to recycle.' },
        }),
        creative_ideas: [
          { title: 'Use a box for household storage', effort: 'easy' },
          { title: 'Make simple drawer dividers', effort: 'medium' },
          { title: 'Turn stout card into a kids’ play structure', effort: 'involved' },
        ],
        recipient_type: 'school or community centre',
        warning: null,
      };

    case 'metal':
      return {
        identified: true,
        item: 'metal item',
        material: 'metal',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'Scrap metal is widely recycled and should not go in residual waste when a metal bank exists.'
          : 'A sound metal object is usually worth keeping or passing on before it is melted down.',
        condition_check: {
          question: 'Is it clean, with no sharp torn edges or chemical residue?',
          if_good: 'Keep using it, or rinse and recycle empty food cans.',
          if_bad: 'Protect sharp edges. Recycle clean scrap; do not crush aerosol cans that still hold pressure.',
        },
        steps: [
          'Rinse food cans and let them dry.',
          'Check for sharp lids and tape them down.',
          'Empty aerosols completely; do not puncture them.',
          'Use metal recycling or a scrap point for larger pieces.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep a sound piece', note: 'Tins and trays can store hardware or dry goods.' },
          donate: { title: 'Donate useful metalware', note: 'Sound tools and tins sometimes help a community workshop.' },
          sell: { title: 'Sell tools or larger scrap', note: 'Hand tools and large metal pieces can have local value.' },
          recycle: { title: 'Use metal recycling', note: 'Most councils accept steel and aluminium at the kerb or tip.' },
        }),
        creative_ideas: [
          { title: 'Use a clean tin for hardware', effort: 'easy' },
          { title: 'Make a simple desk tidy', effort: 'medium' },
          { title: 'Take larger scrap to a metal merchant', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'community workshop',
        warning: 'Do not puncture pressurised cans. Paint and chemical tins need a household-hazardous-waste site.',
      };

    case 'plastic':
      return {
        identified: true,
        item: 'plastic item',
        material: 'plastic',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'If your local service accepts this plastic type, recycling beats the residual bin.'
          : 'A sound plastic container is usually more useful in the home than as recycling.',
        condition_check: {
          question: 'Is it clean, uncracked, and marked with a resin code your service accepts?',
          if_good: 'Keep using it for dry storage, or rinse it for recycling.',
          if_bad: 'Cracked food containers should not hold food. Recycle only if the type is accepted locally.',
        },
        steps: [
          'Read the recycling mark on the base.',
          'Rinse food residue; lids may belong in a different stream.',
          broken ? 'Recycle only the types your collection actually takes.' : 'Reuse sound tubs before you recycle them.',
          'Soft film usually needs a supermarket collection, not the kerb bin.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep it for storage', note: 'Sound tubs are useful for food, hardware, or leftovers.' },
          donate: { title: 'Pass on unused storage', note: 'Community kitchens sometimes want clean, lidded tubs.' },
          sell: { title: 'Sell only unused sets', note: 'Used everyday plastic rarely sells.' },
          recycle: { title: 'Follow the local plastic rules', note: 'Acceptance varies widely by resin type and council.' },
        }),
        creative_ideas: [
          { title: 'Use a tub for freezer leftovers', effort: 'easy' },
          { title: 'Make a simple drawer organiser', effort: 'medium' },
          { title: 'Take film packaging to a store drop-off', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'community kitchen',
        warning: null,
      };

    default:
      return {
        identified: true,
        item: 'household object',
        material: 'mixed or unknown materials',
        best_option: broken ? 'recycle' : 'reuse',
        reason: broken
          ? 'If it cannot be used safely, separate the materials and recycle what your service accepts.'
          : 'If it still looks usable, keeping it in service is the lowest-waste next step.',
        condition_check: {
          question: 'Can you tell what it is made of, and is it safe to handle with no chemical smell or sharp damage?',
          if_good: 'Keep using it, or pass it to someone who needs that kind of object.',
          if_bad: 'Do not guess with chemicals, batteries, or sharp waste. Use the correct drop-off.',
        },
        steps: [
          'Identify the main material if you can.',
          'Set aside anything that looks like a battery, chemical, or medicine.',
          broken ? 'Recycle only the parts your local service accepts.' : 'Keep it if it is safe, or offer it to a charity shop.',
          'When unsure, ask your council’s waste guide before you bin it.',
        ],
        other_options: others(broken ? 'recycle' : 'reuse', {
          reuse: { title: 'Keep it if it is safe', note: 'A second use at home beats a trip to the bin.' },
          donate: { title: 'Offer it to a charity shop', note: 'Only if it is clean, complete, and something they can sell.' },
          sell: { title: 'Sell if someone would pay', note: 'Local listing works for complete, working household goods.' },
          recycle: { title: 'Match the material to a stream', note: 'Mixed objects often need taking apart first.' },
        }),
        creative_ideas: [
          { title: 'Give it a new job in the same room', effort: 'easy' },
          { title: 'Take it to a repair cafe', effort: 'medium' },
          { title: 'List it on a local giveaway group', effort: 'involved' },
        ],
        recipient_type: broken ? null : 'charity shop or community centre',
        warning:
          'If this could be a battery, chemical, medicine, or sharp waste, do not put it in ordinary household waste.',
      };
  }
}
