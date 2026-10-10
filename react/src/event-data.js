/* Curated public Knight Hacks IX facts, checked 2026-10-10.
   Guide and linked agenda take precedence over the older homepage FAQ.
   Field names align with the public PortalScheduleEvent shape; ISO strings
   keep the static fixture serializable. null means unpublished, never guessed. */
export const data = (() => {
  const guide = 'https://knight-hacks.notion.site/knight-hacks-ix-hackers-guide';
  const agenda = 'https://knight-hacks.notion.site/Knight-Hacks-IX-Schedule-38ae290ccffe802796e3e34ff53952f5';
  const event = (id, name, startDateTime, endDateTime, location, tag, description, sponsorIds = []) => ({
    id: `khix-${id}`, name, startDateTime, endDateTime, location, tag, description, sponsorIds,
    points: null, purpose: id === 'check-in' ? 'primary_check_in' : 'event', sourceUrl: agenda
  });
  return {
    name: 'Knight Hacks IX', startDate: '2026-10-09', endDate: '2026-10-11', timeZone: 'America/New_York',
    venue: 'University of Central Florida', checkedAt: '2026-10-10',
    sources: {guide, agenda, website:'https://2026.knighthacks.org/', sponsors:'https://2026.knighthacks.org/#sponsors', mlh:'https://www.mlh.com/seasons/2027/events', devpost:'https://knight-hacks-ix.devpost.com/'},
    days: [{date:'2026-10-09',label:'Friday',short:'Oct 9'},{date:'2026-10-10',label:'Saturday',short:'Oct 10'},{date:'2026-10-11',label:'Sunday',short:'Oct 11'}],
    events: [
      event('check-in','Welcome to Knight Hacks IX','2026-10-09T16:00:00-04:00','2026-10-09T18:45:00-04:00','ENG2 102','Check-in','Bring a photo ID and your Blade QR code. Swag pickup is in the same room; both close at 6:45 PM.'),
      event('opening','Opening Ceremony','2026-10-09T19:00:00-04:00','2026-10-09T21:00:00-04:00','SU Cape Florida Ballroom','Ceremony','Attend in Cape Florida, or watch the stream in SU Key West Ballroom. Includes event information, sponsor announcements, and challenge reveals.'),
      event('teams','Team Building','2026-10-09T21:00:00-04:00','2026-10-09T22:00:00-04:00','SU Cape Florida Ballroom','Social','Meet teammates and discuss project ideas after Opening Ceremony. Teams can have up to four people.'),
      event('career-fair','Meet Our Sponsors!','2026-10-09T22:00:00-04:00','2026-10-10T00:00:00-04:00','SU Key West Ballroom','Career fair','Entry is by character class: Chomper + Spora at 10 PM; Whisperseed + Dryad at 10:30 PM; Petalborn + Collosus at 11 PM; everyone at 11:30 PM. Check Discord for your class and bring printed resumes.'),
      event('hacking-begins','Hacking begins','2026-10-09T23:00:00-04:00',null,null,'Milestone','The 36-hour hacking period begins. Use the permitted hacking spaces listed in the guide.'),
      event('hackathons-101','KH: Hackathons 101 - Sprout Track','2026-10-10T00:00:00-04:00','2026-10-10T01:00:00-04:00','ENG2 102','Workshop','An introduction to forming a team, choosing a project, and preparing a demo.'),
      event('full-stack','KH: Intro to Full Stack','2026-10-10T02:00:00-04:00','2026-10-10T03:00:00-04:00','ENG2 102','Workshop','An introduction to how the parts of a web application work together.'),
      event('codex','KH: Intro to Vibe Coding X OpenAI Codex','2026-10-10T08:15:00-04:00','2026-10-10T09:15:00-04:00','BA1 119','Workshop','Explore coding with AI assistance alongside Knight Hacks and OpenAI Codex.',['codex']),
      event('databricks','Databricks: Intro to Databricks','2026-10-10T09:15:00-04:00','2026-10-10T10:15:00-04:00','ENG2 102','Workshop','An introductory Databricks session with time to bring your questions.',['databricks']),
      event('flower-crowns','KH x GWC: Flower Crown Making','2026-10-10T11:00:00-04:00','2026-10-10T12:30:00-04:00','BA1 146','Social','Make a flower crown with Girls Who Code and take a creative break.'),
      event('oneethos','OneEthos: Meet the OneEthos Team & Challenge','2026-10-10T12:15:00-04:00','2026-10-10T13:15:00-04:00','BA1 119','Workshop','Meet the team and learn about the OneEthos challenge.',['oneethos']),
      event('figma','Figma Make Workshop','2026-10-10T17:15:00-04:00','2026-10-10T18:15:00-04:00','ENG2 102','Sponsor workshop','Explore Figma Make with other hackers.',['figma']),
      event('aws','AWS: Build in the Cloud and Network with AWS professionals','2026-10-10T19:15:00-04:00','2026-10-10T20:15:00-04:00','ENG2 102','Workshop','A cloud workshop and opportunity to connect with AWS professionals.',['aws']),
      event('devpost-workshop','KH: DevPost Workshop','2026-10-11T08:00:00-04:00','2026-10-11T09:00:00-04:00','ENG2 102','Workshop','Prepare your Devpost submission and review its required fields before the deadline.'),
      event('submission','Devpost submission deadline','2026-10-11T10:00:00-04:00',null,'Devpost','Deadline','The hacker guide specifies a hard 10 AM deadline with no late submissions. The Devpost page header lists 11 AM; follow the guide and confirm any updates with organizers.'),
      event('code-freeze','Final code push / hacking ends','2026-10-11T11:00:00-04:00',null,'Your project repository','Deadline','Finish your final code push by 11 AM. The guide prohibits code or repository changes afterward.'),
      event('judging','Judging / Project Expo','2026-10-11T12:00:00-04:00','2026-10-11T16:00:00-04:00',null,'Judging','Claim your project on the Hacker Dashboard to see assigned judging times and rooms. Each appointment allows 2 minutes to set up, 6 for judging, and 2 to pack up.'),
      event('closing','Closing Ceremony','2026-10-11T18:00:00-04:00','2026-10-11T19:30:00-04:00','SU Cape Florida Ballroom','Ceremony','Attend in Cape Florida or watch the stream in SU Key West Ballroom. Winners watching in Key West will be escorted by an organizer.')
    ],
    sponsors: [
      {id:'codex',name:'OpenAI Codex',website:'https://openai.com/codex/',focus:'AI-assisted coding',careerFair:false,challenge:null},
      {id:'databricks',name:'Databricks',website:'https://www.databricks.com/',focus:'Data & AI',careerFair:true,challenge:'Best Use of Databricks'},
      {id:'oneethos',name:'OneEthos',website:'https://www.oneethos.com/',focus:'Innovation for Good',careerFair:true,challenge:'Innovation for Good'},
      {id:'figma',name:'Figma',website:'https://www.figma.com/',focus:'Design & Figma Make',careerFair:true,challenge:'Best Design'},
      {id:'aws',name:'AWS',website:'https://aws.amazon.com/',focus:'Cloud development',careerFair:true,challenge:null},
      {id:'hugging-face',name:'Hugging Face',website:'https://huggingface.co/',focus:'Open-source AI',careerFair:true,challenge:'Best Use of Open Source AI'}
    ].map(sponsor=>({...sponsor,sourceUrl:`${guide}#3e4e290ccffe803e8f67e3ed90bae377`})),
    help: [
      {title:'Find a mentor',text:'Visit the ENG2 Atrium or ask in #ask-mentors on Discord.',url:`${guide}#378e290ccffe80c687f6cad6f0cd2a39`},
      {title:'Find a team',text:'Teams have up to four people. Try #introductions and #team-building on Discord.',url:`${guide}#378e290ccffe804f8254e715e79101bc`},
      {title:'Ask an organizer',text:'Use #ask-organizers on the Knight Hacks Discord for event questions.',url:'https://discord.knighthacks.org/'}
    ]
  };
})();
