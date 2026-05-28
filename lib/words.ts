const ADJECTIVES = [
  'amber','bold','calm','crisp','dawn','eager','fair','glad','hazy','idle',
  'jade','keen','lush','mild','neat','opal','pale','quick','rare','soft',
  'tall','urban','vast','warm','young','zesty','bright','clean','deep','early',
  'fresh','gold','high','icy','just','kind','long','mint','nice','open',
  'pink','quiet','rich','sage','thin','used','vivid','wide','exact','fuzzy',
  'grand','happy','inner','jolly','lucky','merry','noble','older','proud','rosy',
  'sharp','sweet','tidy','usual','vocal','witty','extra','young','zippy','azure',
  'brave','cubic','dusty','elite','fancy','giant','hasty','iconic','jazzy','known',
  'leafy','magic','nimble','oval','plum','quaint','rapid','snowy','teal','ultra',
  'vivid','woody','xenon','yummy','zonal','airy','breezy','curly','dainty','earthy',
]

const NOUNS = [
  'apple','brook','cedar','delta','eagle','fjord','grove','haven','inlet','jetty',
  'kite','lagoon','maple','nebula','orbit','petal','quartz','river','stone','tide',
  'umbra','vale','wave','yonder','zenith','amber','birch','cloud','dune','ember',
  'fern','glacier','horizon','island','jungle','kelp','linden','meadow','north','oak',
  'pine','quest','reef','summit','trail','union','violet','willow','axis','bluff',
  'coast','dome','echo','flare','gate','hill','iris','jade','knoll','lane',
  'mist','nova','onyx','peak','quill','ridge','shore','tower','upper','vault',
  'wind','xenon','yarn','zone','arch','basin','cliff','drift','estuary','ford',
  'glade','heath','isle','jazz','karst','ledge','marsh','nook','oasis','prism',
  'rill','slope','torch','umber','verde','wren','xray','yew','zeal','brook',
]

export function generateWorkspaceSlug(): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
  // adjective-noun-noun format, e.g. "calm-river-pine"
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(NOUNS)}`
}
