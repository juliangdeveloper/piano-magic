'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rivals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FREE_ID = 'libre';
  var FREE_HP = 999999;

  var LIST = [
    {
      id: 'parade-feather',
      label: 'Parade Feather',
      chart: 'charts/parade-feather.json',
      sprite: 'assets/bosses/parade-feather/spritesheet.png',
      timings: 'assets/bosses/parade-feather/timings.json',
      portrait: 'assets/bosses/parade-feather/portrait.png'
    },
    {
      id: 'veil-boat',
      label: 'The Veil Boat',
      chart: 'charts/veil-boat.json',
      sprite: 'assets/bosses/veil-boat/spritesheet.png',
      timings: 'assets/bosses/veil-boat/timings.json',
      portrait: 'assets/bosses/veil-boat/portrait.png'
    },
    {
      id: 'tower-chime',
      label: 'Tower Chime',
      chart: 'charts/tower-chime.json',
      sprite: 'assets/bosses/tower-chime/spritesheet.png',
      timings: 'assets/bosses/tower-chime/timings.json',
      portrait: 'assets/bosses/tower-chime/portrait.png'
    },
    {
      id: 'new-world-largo',
      label: 'New World Largo',
      chart: 'charts/new-world-largo.json',
      hue: 'hue-rotate(330deg) saturate(1.45) brightness(1.08)'
    },
    {
      id: 'camptown-races',
      label: 'Camptown Races',
      chart: 'charts/camptown-races.json',
      hue: 'hue-rotate(95deg) saturate(0.25) brightness(1.45)'
    },
    {
      id: 'eine-kleine',
      label: 'Eine Kleine Nachtmusik',
      chart: 'charts/eine-kleine.json',
      hue: 'hue-rotate(200deg) saturate(0.85) brightness(0.75)'
    },
    {
      id: 'jingle-bells',
      label: 'Jingle Bells',
      chart: 'charts/jingle-bells.json',
      sprite: 'assets/bosses/jingle-bells/spritesheet.png',
      timings: 'assets/bosses/jingle-bells/timings.json',
      portrait: 'assets/bosses/jingle-bells/portrait.png'
    },
    {
      id: 'surprise-symphony',
      label: 'Surprise Symphony',
      chart: 'charts/surprise-symphony.json',
      sprite: 'assets/bosses/surprise-symphony/spritesheet.png',
      timings: 'assets/bosses/surprise-symphony/timings.json',
      portrait: 'assets/bosses/surprise-symphony/portrait.png'
    },
    {
      id: 'peer-gynt-morning',
      label: 'Morning',
      chart: 'charts/peer-gynt-morning.json',
      sprite: 'assets/bosses/peer-gynt-morning/spritesheet.png',
      timings: 'assets/bosses/peer-gynt-morning/timings.json',
      portrait: 'assets/bosses/peer-gynt-morning/portrait.png'
    },
    {
      id: 'simple-gifts',
      label: 'Simple Gifts',
      chart: 'charts/simple-gifts.json',
      sprite: 'assets/bosses/simple-gifts/spritesheet.png',
      timings: 'assets/bosses/simple-gifts/timings.json',
      portrait: 'assets/bosses/simple-gifts/portrait.png'
    },
    {
      id: 'amazing-grace',
      label: 'Amazing Grace',
      chart: 'charts/amazing-grace.json',
      sprite: 'assets/bosses/amazing-grace/spritesheet.png',
      timings: 'assets/bosses/amazing-grace/timings.json',
      portrait: 'assets/bosses/amazing-grace/portrait.png'
    },
    {
      id: 'merrily-we-roll-along',
      label: 'Merrily We Roll Along',
      chart: 'charts/merrily-we-roll-along.json',
      sprite: 'assets/bosses/merrily-we-roll-along/spritesheet.png',
      timings: 'assets/bosses/merrily-we-roll-along/timings.json',
      portrait: 'assets/bosses/merrily-we-roll-along/portrait.png'
    },
    {
      id: 'ode-to-joy',
      label: 'Ode to Joy',
      chart: 'charts/ode-to-joy.json',
      sprite: 'assets/bosses/ode-to-joy/spritesheet.png',
      timings: 'assets/bosses/ode-to-joy/timings.json',
      portrait: 'assets/bosses/ode-to-joy/portrait.png'
    },
    {
      id: 'yankee-doodle',
      label: 'Yankee Doodle',
      chart: 'charts/yankee-doodle.json',
      sprite: 'assets/bosses/yankee-doodle/spritesheet.png',
      timings: 'assets/bosses/yankee-doodle/timings.json',
      portrait: 'assets/bosses/yankee-doodle/portrait.png'
    },
    {
      id: 'row-your-boat',
      label: 'Row Your Boat',
      chart: 'charts/row-your-boat.json',
      sprite: 'assets/bosses/row-your-boat/spritesheet.png',
      timings: 'assets/bosses/row-your-boat/timings.json',
      portrait: 'assets/bosses/row-your-boat/portrait.png'
    },
    {
      id: 'clock-tower-bells',
      label: 'Clock Tower Bells',
      chart: 'charts/clock-tower-bells.json',
      sprite: 'assets/bosses/clock-tower-bells/spritesheet.png',
      timings: 'assets/bosses/clock-tower-bells/timings.json',
      portrait: 'assets/bosses/clock-tower-bells/portrait.png'
    },
    {
      id: 'russian-folk-song',
      label: 'Russian Folk Song',
      chart: 'charts/russian-folk-song.json',
      sprite: 'assets/bosses/russian-folk-song/spritesheet.png',
      timings: 'assets/bosses/russian-folk-song/timings.json',
      portrait: 'assets/bosses/russian-folk-song/portrait.png'
    },
    {
      id: 'shining-stars',
      label: 'Shining Stars',
      chart: 'charts/shining-stars.json',
      sprite: 'assets/bosses/shining-stars/spritesheet.png',
      timings: 'assets/bosses/shining-stars/timings.json',
      portrait: 'assets/bosses/shining-stars/portrait.png'
    },
    {
      id: 'hungarian-dance',
      label: 'Hungarian Dance',
      chart: 'charts/hungarian-dance.json',
      sprite: 'assets/bosses/hungarian-dance/spritesheet.png',
      timings: 'assets/bosses/hungarian-dance/timings.json',
      portrait: 'assets/bosses/hungarian-dance/portrait.png'
    },
    {
      id: 'shepherds-song',
      label: 'Shepherds Song',
      chart: 'charts/shepherds-song.json',
      sprite: 'assets/bosses/shepherds-song/spritesheet.png',
      timings: 'assets/bosses/shepherds-song/timings.json',
      portrait: 'assets/bosses/shepherds-song/portrait.png'
    },
    {
      id: 'french-minuet',
      label: 'French Minuet',
      chart: 'charts/french-minuet.json',
      sprite: 'assets/bosses/french-minuet/spritesheet.png',
      timings: 'assets/bosses/french-minuet/timings.json',
      portrait: 'assets/bosses/french-minuet/portrait.png'
    },
    {
      id: 'taps',
      label: 'Taps',
      chart: 'charts/taps.json',
      sprite: 'assets/bosses/taps/spritesheet.png',
      timings: 'assets/bosses/taps/timings.json',
      portrait: 'assets/bosses/taps/portrait.png'
    },
    {
      id: 'happy-birthday',
      label: 'Happy Birthday',
      chart: 'charts/happy-birthday.json',
      sprite: 'assets/bosses/happy-birthday/spritesheet.png',
      timings: 'assets/bosses/happy-birthday/timings.json',
      portrait: 'assets/bosses/happy-birthday/portrait.png'
    },
    {
      id: 'english-folk-song',
      label: 'English Folk Song',
      chart: 'charts/english-folk-song.json',
      sprite: 'assets/bosses/english-folk-song/spritesheet.png',
      timings: 'assets/bosses/english-folk-song/timings.json',
      portrait: 'assets/bosses/english-folk-song/portrait.png'
    },
    {
      id: 'gavotte-b1',
      label: 'Gavotte',
      chart: 'charts/gavotte-b1.json',
      sprite: 'assets/bosses/gavotte-b1/spritesheet.png',
      timings: 'assets/bosses/gavotte-b1/timings.json',
      portrait: 'assets/bosses/gavotte-b1/portrait.png'
    },
    {
      id: 'five-hundred-year-old-melody',
      label: '500-Year-Old Melody',
      chart: 'charts/five-hundred-year-old-melody.json',
      sprite: 'assets/bosses/five-hundred-year-old-melody/spritesheet.png',
      timings: 'assets/bosses/five-hundred-year-old-melody/timings.json',
      portrait: 'assets/bosses/five-hundred-year-old-melody/portrait.png'
    },
    {
      id: 'reveille',
      label: 'Reveille',
      chart: 'charts/reveille.json',
      sprite: 'assets/bosses/reveille/spritesheet.png',
      timings: 'assets/bosses/reveille/timings.json',
      portrait: 'assets/bosses/reveille/portrait.png'
    },
    {
      id: 'when-the-saints',
      label: 'When the Saints Go Marching In',
      chart: 'charts/when-the-saints.json',
      sprite: 'assets/bosses/when-the-saints/spritesheet.png',
      timings: 'assets/bosses/when-the-saints/timings.json',
      portrait: 'assets/bosses/when-the-saints/portrait.png'
    },
    {
      id: 'african-celebration',
      label: 'African Celebration',
      chart: 'charts/african-celebration.json',
      sprite: 'assets/bosses/african-celebration/spritesheet.png',
      timings: 'assets/bosses/african-celebration/timings.json',
      portrait: 'assets/bosses/african-celebration/portrait.png'
    },
    {
      id: 'musette',
      label: 'Musette',
      chart: 'charts/musette.json',
      sprite: 'assets/bosses/musette/spritesheet.png',
      timings: 'assets/bosses/musette/timings.json',
      portrait: 'assets/bosses/musette/portrait.png'
    },
    {
      id: 'american-fiddle-tune',
      label: 'American Fiddle Tune',
      chart: 'charts/american-fiddle-tune.json',
      sprite: 'assets/bosses/american-fiddle-tune/spritesheet.png',
      timings: 'assets/bosses/american-fiddle-tune/timings.json',
      portrait: 'assets/bosses/american-fiddle-tune/portrait.png'
    },
    {
      id: 'theme-by-mozart',
      label: 'Theme by Mozart',
      chart: 'charts/theme-by-mozart.json',
      sprite: 'assets/bosses/theme-by-mozart/spritesheet.png',
      timings: 'assets/bosses/theme-by-mozart/timings.json',
      portrait: 'assets/bosses/theme-by-mozart/portrait.png'
    },
    {
      id: 'greensleeves',
      label: 'Greensleeves',
      chart: 'charts/greensleeves.json',
      sprite: 'assets/bosses/greensleeves/spritesheet.png',
      timings: 'assets/bosses/greensleeves/timings.json',
      portrait: 'assets/bosses/greensleeves/portrait.png'
    },
    {
      id: 'romance',
      label: 'Romance',
      chart: 'charts/romance.json',
      sprite: 'assets/bosses/romance/spritesheet.png',
      timings: 'assets/bosses/romance/timings.json',
      portrait: 'assets/bosses/romance/portrait.png'
    },
    {
      id: 'sleeping-beauty-waltz',
      label: 'Sleeping Beauty Waltz',
      chart: 'charts/sleeping-beauty-waltz.json',
      sprite: 'assets/bosses/sleeping-beauty-waltz/spritesheet.png',
      timings: 'assets/bosses/sleeping-beauty-waltz/timings.json',
      portrait: 'assets/bosses/sleeping-beauty-waltz/portrait.png'
    },
    {
      id: 'promenade',
      label: 'Promenade',
      chart: 'charts/promenade.json',
      sprite: 'assets/bosses/promenade/spritesheet.png',
      timings: 'assets/bosses/promenade/timings.json',
      portrait: 'assets/bosses/promenade/portrait.png'
    },
    {
      id: 'danny-boy',
      label: 'Danny Boy Londonderry Air',
      chart: 'charts/danny-boy.json',
      sprite: 'assets/bosses/danny-boy/spritesheet.png',
      timings: 'assets/bosses/danny-boy/timings.json',
      portrait: 'assets/bosses/danny-boy/portrait.png'
    },
    {
      id: 'aria',
      label: 'Aria',
      chart: 'charts/aria.json',
      sprite: 'assets/bosses/aria/spritesheet.png',
      timings: 'assets/bosses/aria/timings.json',
      portrait: 'assets/bosses/aria/portrait.png'
    },
    {
      id: 'nobody-knows',
      label: 'Nobody Knows the Trouble Ive Seen',
      chart: 'charts/nobody-knows.json',
      sprite: 'assets/bosses/nobody-knows/spritesheet.png',
      timings: 'assets/bosses/nobody-knows/timings.json',
      portrait: 'assets/bosses/nobody-knows/portrait.png'
    },
    {
      id: 'vive-la-france',
      label: 'Vive la France',
      chart: 'charts/vive-la-france.json',
      sprite: 'assets/bosses/vive-la-france/spritesheet.png',
      timings: 'assets/bosses/vive-la-france/timings.json',
      portrait: 'assets/bosses/vive-la-france/portrait.png'
    },
    {
      id: 'trumpet-voluntary',
      label: 'Trumpet Voluntary',
      chart: 'charts/trumpet-voluntary.json',
      sprite: 'assets/bosses/trumpet-voluntary/spritesheet.png',
      timings: 'assets/bosses/trumpet-voluntary/timings.json',
      portrait: 'assets/bosses/trumpet-voluntary/portrait.png'
    },
    {
      id: 'can-can',
      label: 'Can-Can',
      chart: 'charts/can-can.json',
      sprite: 'assets/bosses/can-can/spritesheet.png',
      timings: 'assets/bosses/can-can/timings.json',
      portrait: 'assets/bosses/can-can/portrait.png'
    },
    {
      id: 'ice-skaters',
      label: 'Ice Skaters Waltz',
      chart: 'charts/ice-skaters.json',
      sprite: 'assets/bosses/ice-skaters/spritesheet.png',
      timings: 'assets/bosses/ice-skaters/timings.json',
      portrait: 'assets/bosses/ice-skaters/portrait.png'
    },
    {
      id: 'rise-and-shine',
      label: 'Rise and Shine',
      chart: 'charts/rise-and-shine.json',
      sprite: 'assets/bosses/rise-and-shine/spritesheet.png',
      timings: 'assets/bosses/rise-and-shine/timings.json',
      portrait: 'assets/bosses/rise-and-shine/portrait.png'
    },
    {
      id: 'trumpet-concerto',
      label: 'Trumpet Concerto',
      chart: 'charts/trumpet-concerto.json',
      sprite: 'assets/bosses/trumpet-concerto/spritesheet.png',
      timings: 'assets/bosses/trumpet-concerto/timings.json',
      portrait: 'assets/bosses/trumpet-concerto/portrait.png'
    },
    {
      id: 'the-entertainer',
      label: 'The Entertainer',
      chart: 'charts/the-entertainer.json',
      sprite: 'assets/bosses/the-entertainer/spritesheet.png',
      timings: 'assets/bosses/the-entertainer/timings.json',
      portrait: 'assets/bosses/the-entertainer/portrait.png'
    },
    {
      id: 'home-on-the-range',
      label: 'Home on the Range',
      chart: 'charts/home-on-the-range.json',
      sprite: 'assets/bosses/home-on-the-range/spritesheet.png',
      timings: 'assets/bosses/home-on-the-range/timings.json',
      portrait: 'assets/bosses/home-on-the-range/portrait.png'
    },
    {
      id: 'minuet-in-g',
      label: 'Minuet in G',
      chart: 'charts/minuet-in-g.json',
      sprite: 'assets/bosses/minuet-in-g/spritesheet.png',
      timings: 'assets/bosses/minuet-in-g/timings.json',
      portrait: 'assets/bosses/minuet-in-g/portrait.png'
    },
    {
      id: 'alexander-march',
      label: 'Alexander March',
      chart: 'charts/alexander-march.json',
      sprite: 'assets/bosses/alexander-march/spritesheet.png',
      timings: 'assets/bosses/alexander-march/timings.json',
      portrait: 'assets/bosses/alexander-march/portrait.png'
    },
    {
      id: 'french-dance',
      label: 'French Dance',
      chart: 'charts/french-dance.json',
      sprite: 'assets/bosses/french-dance/spritesheet.png',
      timings: 'assets/bosses/french-dance/timings.json',
      portrait: 'assets/bosses/french-dance/portrait.png'
    },
    {
      id: 'polovtsian-dance',
      label: 'Polovtsian Dance',
      chart: 'charts/polovtsian-dance.json',
      sprite: 'assets/bosses/polovtsian-dance/spritesheet.png',
      timings: 'assets/bosses/polovtsian-dance/timings.json',
      portrait: 'assets/bosses/polovtsian-dance/portrait.png'
    },
    {
      id: 'for-hes-a-jolly-good-fellow',
      label: 'For Hes a Jolly Good Fellow',
      chart: 'charts/for-hes-a-jolly-good-fellow.json',
      sprite: 'assets/bosses/for-hes-a-jolly-good-fellow/spritesheet.png',
      timings: 'assets/bosses/for-hes-a-jolly-good-fellow/timings.json',
      portrait: 'assets/bosses/for-hes-a-jolly-good-fellow/portrait.png'
    },
    {
      id: 'banuwa',
      label: 'Banuwa Village',
      chart: 'charts/banuwa.json',
      sprite: 'assets/bosses/banuwa/spritesheet.png',
      timings: 'assets/bosses/banuwa/timings.json',
      portrait: 'assets/bosses/banuwa/portrait.png'
    },
    {
      id: 'carnival-of-venice',
      label: 'The Carnival of Venice',
      chart: 'charts/carnival-of-venice.json',
      sprite: 'assets/bosses/carnival-of-venice/spritesheet.png',
      timings: 'assets/bosses/carnival-of-venice/timings.json',
      portrait: 'assets/bosses/carnival-of-venice/portrait.png'
    },
    {
      id: 'o-sole-mio',
      label: 'O Sole Mio',
      chart: 'charts/o-sole-mio.json',
      sprite: 'assets/bosses/o-sole-mio/spritesheet.png',
      timings: 'assets/bosses/o-sole-mio/timings.json',
      portrait: 'assets/bosses/o-sole-mio/portrait.png'
    },
    {
      id: 'yellow-bird',
      label: 'Yellow Bird',
      chart: 'charts/yellow-bird.json',
      sprite: 'assets/bosses/yellow-bird/spritesheet.png',
      timings: 'assets/bosses/yellow-bird/timings.json',
      portrait: 'assets/bosses/yellow-bird/portrait.png'
    },
    {
      id: 'brahms-lullaby',
      label: 'Brahms Lullaby Theory',
      chart: 'charts/brahms-lullaby.json',
      sprite: 'assets/bosses/brahms-lullaby/spritesheet.png',
      timings: 'assets/bosses/brahms-lullaby/timings.json',
      portrait: 'assets/bosses/brahms-lullaby/portrait.png'
    },
    {
      id: 'sloop-john-b',
      label: 'Sloop John B',
      chart: 'charts/sloop-john-b.json',
      sprite: 'assets/bosses/sloop-john-b/spritesheet.png',
      timings: 'assets/bosses/sloop-john-b/timings.json',
      portrait: 'assets/bosses/sloop-john-b/portrait.png'
    },
    {
      id: 'allegro-in-f-beyer',
      label: 'Allegro in F Major Beyer',
      chart: 'charts/allegro-in-f-beyer.json',
      sprite: 'assets/bosses/allegro-in-f-beyer/spritesheet.png',
      timings: 'assets/bosses/allegro-in-f-beyer/timings.json',
      portrait: 'assets/bosses/allegro-in-f-beyer/portrait.png'
    },
    {
      id: 'long-long-ago',
      label: 'Long Long Ago',
      chart: 'charts/long-long-ago.json',
      sprite: 'assets/bosses/long-long-ago/spritesheet.png',
      timings: 'assets/bosses/long-long-ago/timings.json',
      portrait: 'assets/bosses/long-long-ago/portrait.png'
    },
    {
      id: 'aura-lee',
      label: 'Aura Lee Theory',
      chart: 'charts/aura-lee.json',
      sprite: 'assets/bosses/aura-lee/spritesheet.png',
      timings: 'assets/bosses/aura-lee/timings.json',
      portrait: 'assets/bosses/aura-lee/portrait.png'
    },
    {
      id: 'westminster-chimes',
      label: 'Westminster Chimes',
      chart: 'charts/westminster-chimes.json',
      sprite: 'assets/bosses/westminster-chimes/spritesheet.png',
      timings: 'assets/bosses/westminster-chimes/timings.json',
      portrait: 'assets/bosses/westminster-chimes/portrait.png'
    },
    {
      id: 'gavotte-carr',
      label: 'Gavotte Carr',
      chart: 'charts/gavotte-carr.json',
      sprite: 'assets/bosses/gavotte-carr/spritesheet.png',
      timings: 'assets/bosses/gavotte-carr/timings.json',
      portrait: 'assets/bosses/gavotte-carr/portrait.png'
    },
    {
      id: 'swing-low',
      label: 'Swing Low Sweet Chariot',
      chart: 'charts/swing-low.json',
      sprite: 'assets/bosses/swing-low/spritesheet.png',
      timings: 'assets/bosses/swing-low/timings.json',
      portrait: 'assets/bosses/swing-low/portrait.png'
    },
    {
      id: 'shenandoah',
      label: 'Shenandoah Theory',
      chart: 'charts/shenandoah.json',
      sprite: 'assets/bosses/shenandoah/spritesheet.png',
      timings: 'assets/bosses/shenandoah/timings.json',
      portrait: 'assets/bosses/shenandoah/portrait.png'
    },
    {
      id: 'amen',
      label: 'Amen',
      chart: 'charts/amen.json',
      sprite: 'assets/bosses/amen/spritesheet.png',
      timings: 'assets/bosses/amen/timings.json',
      portrait: 'assets/bosses/amen/portrait.png'
    },
    {
      id: 'kum-ba-yah',
      label: 'Kum Ba Yah',
      chart: 'charts/kum-ba-yah.json',
      sprite: 'assets/bosses/kum-ba-yah/spritesheet.png',
      timings: 'assets/bosses/kum-ba-yah/timings.json',
      portrait: 'assets/bosses/kum-ba-yah/portrait.png'
    },
    {
      id: 'theme-scheherazade',
      label: 'Theme from Scheherazade',
      chart: 'charts/theme-scheherazade.json',
      sprite: 'assets/bosses/theme-scheherazade/spritesheet.png',
      timings: 'assets/bosses/theme-scheherazade/timings.json',
      portrait: 'assets/bosses/theme-scheherazade/portrait.png'
    },
    {
      id: 'auld-lang-syne',
      label: 'Auld Lang Syne Theory',
      chart: 'charts/auld-lang-syne.json',
      sprite: 'assets/bosses/auld-lang-syne/spritesheet.png',
      timings: 'assets/bosses/auld-lang-syne/timings.json',
      portrait: 'assets/bosses/auld-lang-syne/portrait.png'
    },
    {
      id: 'sakura',
      label: 'Sakura',
      chart: 'charts/sakura.json',
      sprite: 'assets/bosses/sakura/spritesheet.png',
      timings: 'assets/bosses/sakura/timings.json',
      portrait: 'assets/bosses/sakura/portrait.png'
    },
    {
      id: 'etude-in-a-minor',
      label: 'Etude in A Minor Kohler',
      chart: 'charts/etude-in-a-minor.json',
      sprite: 'assets/bosses/etude-in-a-minor/spritesheet.png',
      timings: 'assets/bosses/etude-in-a-minor/timings.json',
      portrait: 'assets/bosses/etude-in-a-minor/portrait.png'
    },
    {
      id: 'hava-nagila',
      label: 'Hava Nagila',
      chart: 'charts/hava-nagila.json',
      sprite: 'assets/bosses/hava-nagila/spritesheet.png',
      timings: 'assets/bosses/hava-nagila/timings.json',
      portrait: 'assets/bosses/hava-nagila/portrait.png'
    },
    {
      id: 'give-my-regards',
      label: 'Give My Regards to Broadway',
      chart: 'charts/give-my-regards.json',
      sprite: 'assets/bosses/give-my-regards/spritesheet.png',
      timings: 'assets/bosses/give-my-regards/timings.json',
      portrait: 'assets/bosses/give-my-regards/portrait.png'
    },
    {
      id: 'mexican-clapping-song',
      label: 'Mexican Clapping Song Theory',
      chart: 'charts/mexican-clapping-song.json',
      sprite: 'assets/bosses/mexican-clapping-song/spritesheet.png',
      timings: 'assets/bosses/mexican-clapping-song/timings.json',
      portrait: 'assets/bosses/mexican-clapping-song/portrait.png'
    },
    {
      id: 'habanera',
      label: 'Habanera',
      chart: 'charts/habanera.json',
      sprite: 'assets/bosses/habanera/spritesheet.png',
      timings: 'assets/bosses/habanera/timings.json',
      portrait: 'assets/bosses/habanera/portrait.png'
    },
    {
      id: 'joshua-ponses',
      label: 'Joshua Fought the Battle of Jericho',
      chart: 'charts/joshua-ponses.json',
      sprite: 'assets/bosses/joshua-ponses/spritesheet.png',
      timings: 'assets/bosses/joshua-ponses/timings.json',
      portrait: 'assets/bosses/joshua-ponses/portrait.png'
    },
    {
      id: 'dark-eyes',
      label: 'Dark Eyes Theory',
      chart: 'charts/dark-eyes.json',
      sprite: 'assets/bosses/dark-eyes/spritesheet.png',
      timings: 'assets/bosses/dark-eyes/timings.json',
      portrait: 'assets/bosses/dark-eyes/portrait.png'
    },
    {
      id: 'scarborough-fair',
      label: 'Scarborough Fair',
      chart: 'charts/scarborough-fair.json',
      sprite: 'assets/bosses/scarborough-fair/spritesheet.png',
      timings: 'assets/bosses/scarborough-fair/timings.json',
      portrait: 'assets/bosses/scarborough-fair/portrait.png'
    },
    {
      id: 'campbells-are-coming',
      label: 'Campbells Are Coming',
      chart: 'charts/campbells-are-coming.json',
      sprite: 'assets/bosses/campbells-are-coming/spritesheet.png',
      timings: 'assets/bosses/campbells-are-coming/timings.json',
      portrait: 'assets/bosses/campbells-are-coming/portrait.png'
    },
    {
      id: 'funiculi',
      label: 'Funiculi Funicula',
      chart: 'charts/funiculi.json',
      sprite: 'assets/bosses/funiculi/spritesheet.png',
      timings: 'assets/bosses/funiculi/timings.json',
      portrait: 'assets/bosses/funiculi/portrait.png'
    },
    {
      id: 'barcarolle',
      label: 'Barcarolle Theory',
      chart: 'charts/barcarolle.json',
      sprite: 'assets/bosses/barcarolle/spritesheet.png',
      timings: 'assets/bosses/barcarolle/timings.json',
      portrait: 'assets/bosses/barcarolle/portrait.png'
    },
    {
      id: 'march-slav',
      label: 'March Slav',
      chart: 'charts/march-slav.json',
      sprite: 'assets/bosses/march-slav/spritesheet.png',
      timings: 'assets/bosses/march-slav/timings.json',
      portrait: 'assets/bosses/march-slav/portrait.png'
    },
    {
      id: 'erie-canal',
      label: 'The Erie Canal',
      chart: 'charts/erie-canal.json',
      sprite: 'assets/bosses/erie-canal/spritesheet.png',
      timings: 'assets/bosses/erie-canal/timings.json',
      portrait: 'assets/bosses/erie-canal/portrait.png'
    },
    {
      id: 'house-of-the-rising-sun',
      label: 'House of the Rising Sun Theory',
      chart: 'charts/house-of-the-rising-sun.json',
      sprite: 'assets/bosses/house-of-the-rising-sun/spritesheet.png',
      timings: 'assets/bosses/house-of-the-rising-sun/timings.json',
      portrait: 'assets/bosses/house-of-the-rising-sun/portrait.png'
    },
    {
      id: 'song-of-joy',
      label: 'Song of Joy Beethoven',
      chart: 'charts/song-of-joy.json',
      sprite: 'assets/bosses/song-of-joy/spritesheet.png',
      timings: 'assets/bosses/song-of-joy/timings.json',
      portrait: 'assets/bosses/song-of-joy/portrait.png'
    },
    {
      id: 'gavotte-in-d-hook',
      label: 'Gavotte in D Major Hook',
      chart: 'charts/gavotte-in-d-hook.json',
      sprite: 'assets/bosses/gavotte-in-d-hook/spritesheet.png',
      timings: 'assets/bosses/gavotte-in-d-hook/timings.json',
      portrait: 'assets/bosses/gavotte-in-d-hook/portrait.png'
    },
    {
      id: 'worried-man-blues',
      label: 'Worried Man Blues Theory',
      chart: 'charts/worried-man-blues.json',
      sprite: 'assets/bosses/worried-man-blues/spritesheet.png',
      timings: 'assets/bosses/worried-man-blues/timings.json',
      portrait: 'assets/bosses/worried-man-blues/portrait.png'
    },
    {
      id: 'wedding-march',
      label: 'Wedding March',
      chart: 'charts/wedding-march.json',
      sprite: 'assets/bosses/wedding-march/spritesheet.png',
      timings: 'assets/bosses/wedding-march/timings.json',
      portrait: 'assets/bosses/wedding-march/portrait.png'
    },
    {
      id: 'liebestraum',
      label: 'Liebestraum Liszt',
      chart: 'charts/liebestraum.json',
      sprite: 'assets/bosses/liebestraum/spritesheet.png',
      timings: 'assets/bosses/liebestraum/timings.json',
      portrait: 'assets/bosses/liebestraum/portrait.png'
    },
    {
      id: 'deck-the-keys',
      label: 'Deck the Keys with Dotted Quarters',
      chart: 'charts/deck-the-keys.json',
      sprite: 'assets/bosses/deck-the-keys/spritesheet.png',
      timings: 'assets/bosses/deck-the-keys/timings.json',
      portrait: 'assets/bosses/deck-the-keys/portrait.png'
    },
  ];

  function options() {
    return LIST.map(function (r) {
      return {
        id: r.id,
        label: r.label,
        chart: r.chart,
        free: false,
        sprite: r.sprite || null,
        timings: r.timings || null,
        portrait: r.portrait || null,
        hue: r.hue || null
      };
    }).concat([{ id: FREE_ID, label: 'Modo libre', chart: LIST[0].chart, free: true }]);
  }

  function find(id) {
    var all = options();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return all[0];
  }

  function freeChart(base) {
    var c = JSON.parse(JSON.stringify(base));
    c.id = FREE_ID;
    c.title = 'Modo libre';
    c.loop = [{ i: 0, kind: 'hole', notes: [] }];
    c.hp = { player: (base.hp && base.hp.player) || 15, boss: FREE_HP };
    return c;
  }

  return { FREE_ID: FREE_ID, FREE_HP: FREE_HP, LIST: LIST, options: options, find: find, freeChart: freeChart };
});
