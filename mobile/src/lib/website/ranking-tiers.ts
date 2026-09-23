// Point structures copied from src/pages/Rankings.jsx.
export const rankingTiers = [
    {
      type: 'MAJOR',
      maxPoints: '2,600',
      bgGradient: 'bg-red-500',
      bgIcon: 'bg-red-500/20',
      iconColor: 'text-red-500',
      headers: [
        'Winner (1st)',
        'Finalist (2nd)',
        'Semi-Final (3rd / 4th)',
        'Quarter-Final (5th - 8th)',
        'R16 Playoff - 9th Place',
        'R16 Playoff - 10th Place',
        'R16 Playoff - 11th / 12th',
        'R16 Playoff - 13th - 16th',
        'R32 Playoff - 17th'
      ],
      rows: [
        { cat: '1', points: ['2,600', '1,560', '936', '468', '410', '351', '293', '234', '211'], bold: true },
        { cat: '2', points: ['780', '468', '234', '117', '103', '88', '74', '59', '53'], bold: false },
        { cat: '3', points: ['312', '188', '94', '47', '41', '36', '30', '24', '22'], bold: false },
        { cat: '4', points: ['125', '113', '47', '24', '21', '18', '15', '12', '11'], bold: false }
      ]
    },
    {
      type: 'SUPER GOLD',
      maxPoints: '1,500',
      bgGradient: 'bg-amber-600',
      bgIcon: 'bg-amber-600/20',
      iconColor: 'text-amber-500',
      rows: [
        { cat: '1', winner: '1,500', finals: '900', semis: '540', quarters: '270', r16: '135', r32: '68', bold: true },
        { cat: '2', winner: '450', finals: '270', semis: '162', quarters: '97', r16: '58', r32: '35', bold: false },
        { cat: '3', winner: '180', finals: '108', semis: '65', quarters: '39', r16: '23', r32: '14', bold: false },
        { cat: '4', winner: '72', finals: '43', semis: '26', quarters: '16', r16: '9', r32: '6', bold: false }
      ]
    },
    {
      type: 'GOLD',
      maxPoints: '1,000',
      bgGradient: 'bg-yellow-500',
      bgIcon: 'bg-yellow-500/20',
      iconColor: 'text-yellow-400',
      rows: [
        { cat: '1', winner: '1,000', finals: '600', semis: '360', quarters: '180', r16: '90', r32: '45', bold: true },
        { cat: '2', winner: '300', finals: '180', semis: '108', quarters: '54', r16: '27', r32: '14', bold: false },
        { cat: '3', winner: '120', finals: '72', semis: '43', quarters: '22', r16: '11', r32: '5', bold: false },
        { cat: '4', winner: '48', finals: '29', semis: '17', quarters: '9', r16: '4', r32: '2', bold: false }
      ]
    },
    {
      type: 'SILVER',
      maxPoints: '500',
      bgGradient: 'bg-gray-400',
      bgIcon: 'bg-gray-400/20',
      iconColor: 'text-gray-300',
      rows: [
        { cat: '1', winner: '500', finals: '300', semis: '180', quarters: '90', r16: '45', r32: '22', bold: true },
        { cat: '2', winner: '180', finals: '108', semis: '65', quarters: '32', r16: '16', r32: '8', bold: false },
        { cat: '3', winner: '72', finals: '43', semis: '26', quarters: '13', r16: '6', r32: '3', bold: false },
        { cat: '4', winner: '29', finals: '17', semis: '10', quarters: '5', r16: '3', r32: '1', bold: false }
      ]
    },
    {
      type: 'BRONZE',
      maxPoints: '300',
      bgGradient: 'bg-orange-800',
      bgIcon: 'bg-orange-800/20',
      iconColor: 'text-orange-700',
      rows: [
        { cat: '1', winner: '300', finals: '180', semis: '90', quarters: '45', r16: '25', r32: '14', bold: true },
        { cat: '2', winner: '120', finals: '72', semis: '43', quarters: '22', r16: '11', r32: '5', bold: false },
        { cat: '3', winner: '48', finals: '29', semis: '17', quarters: '9', r16: '4', r32: '2', bold: false }
      ]
    }
  ];
