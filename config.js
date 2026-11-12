// TRMS booking app: front-end settings.
// 1) DEMO MODE (default): leave apiUrl empty. The app runs in the browser with fake data so you can try it.
// 2) LIVE MODE: deploy Code.gs as a Google Apps Script web app and paste its URL below.
window.TRMS_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxfZ9MsjXfYdadt8H0fihmZ-SZdjohdqwi_cs2qXrDMczD8PrbfyxjzGqABKGxZl3Uu/exec',

  // Only used in demo mode. In live mode the real settings come from the admin Settings screen.
  demo: {
    schoolName: 'The Rock Montessori School',
    shortName: 'TRMS',
    title: 'Parents/Teachers Conference',
    date: '2026-12-15',
    startTime: '10:00',
    endTime: '17:00',
    slotMinutes: 10,
    venue: 'The Rock Montessori School, Lekki',
    adminEmail: 'trmsdrive@gmail.com',
    adminPasscode: 'demo',
    classes: [
      { id: 'tendershoots', name: 'Tendershoots' },
      { id: 'nursery-1', name: 'Nursery 1' },
      { id: 'nursery-2', name: 'Nursery 2' },
      { id: 'year-1', name: 'Year 1' },
      { id: 'year-2', name: 'Year 2' },
      { id: 'year-3', name: 'Year 3' },
      { id: 'year-4', name: 'Year 4' },
      { id: 'year-5', name: 'Year 5' },
      { id: 'year-6', name: 'Year 6' }
    ]
  }
};
