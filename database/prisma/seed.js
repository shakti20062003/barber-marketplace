const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const WEEKDAY_HOURS = { open: '09:00', close: '19:00', closed: false };
const LATE_HOURS = { open: '10:00', close: '21:00', closed: false };
const WORKING_HOURS = {
  mon: WEEKDAY_HOURS,
  tue: WEEKDAY_HOURS,
  wed: WEEKDAY_HOURS,
  thu: WEEKDAY_HOURS,
  fri: WEEKDAY_HOURS,
  sat: WEEKDAY_HOURS,
  sun: { ...WEEKDAY_HOURS, closed: true },
};
const LATE_WORKING_HOURS = {
  mon: LATE_HOURS,
  tue: LATE_HOURS,
  wed: LATE_HOURS,
  thu: LATE_HOURS,
  fri: LATE_HOURS,
  sat: LATE_HOURS,
  sun: LATE_HOURS,
};

// Deterministic placeholder photos (picsum.photos' seeded endpoint) — not
// real salon photography, just enough so cards/galleries aren't blank while
// the product is built out before any real salon onboards.
function photo(seed, w = 640, h = 480) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

// ---------------------------------------------------------------------------
// Dummy salon catalogue — two city clusters (Mumbai + Bangalore) so search
// returns real results both from the app's Mumbai fallback coordinates and
// from a browser's real geolocation in Bangalore. Every entry here is
// fictional dummy data for local development, not a real business.
// ---------------------------------------------------------------------------
const SALONS = [
  {
    ownerPhone: '+919800000001',
    ownerName: 'Meera Salon Owner',
    name: 'Style Studio Unisex Salon',
    category: 'Unisex',
    description: 'A 3-chair neighbourhood salon offering haircuts, colour, and grooming.',
    city: { name: 'Mumbai', state: 'Maharashtra' },
    lat: 19.076,
    lng: 72.8777,
    hours: WORKING_HOURS,
    badges: ['VERIFIED'],
    media: [photo('style-studio-1'), photo('style-studio-2')],
    services: [
      { name: "Men's Haircut", price: 300, durationMinutes: 30 },
      { name: "Women's Haircut", price: 600, durationMinutes: 45 },
      { name: 'Beard Trim', price: 150, durationMinutes: 15 },
    ],
    staff: [
      { name: 'Ravi Kumar', experienceYears: 8, specializations: ['Fades', 'Beard sculpting'], languages: ['English', 'Hindi'] },
    ],
    reviews: [
      { customerPhone: '+919800000002', customerName: 'Anita Customer', rating: 5, text: 'Great fade, very friendly staff.', serviceIndex: 0, staffIndex: 0 },
      { customerPhone: '+919800003001', customerName: 'Rohan Shah', rating: 4, text: 'Good haircut, slightly long wait.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001002',
    ownerName: 'Imran Shaikh',
    name: 'The Barber Co. — Bandra',
    category: 'Men',
    description: 'Classic barbershop vibes with hot towel shaves and precision fades.',
    city: { name: 'Mumbai', state: 'Maharashtra' },
    lat: 19.0596,
    lng: 72.8295,
    hours: LATE_WORKING_HOURS,
    badges: ['VERIFIED', 'TOP_RATED'],
    media: [photo('barber-co-1'), photo('barber-co-2'), photo('barber-co-3')],
    services: [
      { name: 'Classic Haircut', price: 350, durationMinutes: 30 },
      { name: 'Hot Towel Shave', price: 250, durationMinutes: 25 },
      { name: 'Haircut + Beard Combo', price: 500, durationMinutes: 45 },
    ],
    staff: [
      { name: 'Salman Qureshi', experienceYears: 12, specializations: ['Classic cuts', 'Hot towel shave'], languages: ['English', 'Hindi', 'Urdu'] },
      { name: 'Akash Yadav', experienceYears: 5, specializations: ['Fades', 'Kids haircut'], languages: ['English', 'Hindi'] },
    ],
    reviews: [
      { customerPhone: '+919800003002', customerName: 'Vikram Rao', rating: 5, text: 'Best shave in Bandra, hands down.', serviceIndex: 1, staffIndex: 0 },
      { customerPhone: '+919800003003', customerName: 'Farhan Ali', rating: 5, text: 'Salman is a legend with the clippers.', serviceIndex: 0, staffIndex: 0 },
      { customerPhone: '+919800003004', customerName: 'Dev Patel', rating: 4, text: 'Solid combo package, will return.', serviceIndex: 2, staffIndex: 1 },
    ],
  },
  {
    ownerPhone: '+919800001003',
    ownerName: 'Pooja Nair',
    name: 'Glow & Glam Beauty Parlour',
    category: 'Women',
    description: 'Bridal makeup, skincare facials and hair spa treatments by certified therapists.',
    city: { name: 'Mumbai', state: 'Maharashtra' },
    lat: 19.0825,
    lng: 72.8811,
    hours: WORKING_HOURS,
    badges: ['VERIFIED', 'FEATURED'],
    media: [photo('glow-glam-1'), photo('glow-glam-2')],
    services: [
      { name: 'Classic Facial', price: 800, durationMinutes: 60 },
      { name: "Women's Haircut & Style", price: 700, durationMinutes: 50 },
      { name: 'Bridal Makeup', price: 6000, durationMinutes: 120 },
    ],
    staff: [
      { name: 'Pooja Nair', experienceYears: 10, specializations: ['Bridal makeup', 'Facials'], languages: ['English', 'Hindi', 'Marathi'] },
    ],
    reviews: [
      { customerPhone: '+919800003005', customerName: 'Shreya Kulkarni', rating: 5, text: 'Pooja did my bridal makeup, absolutely stunning!', serviceIndex: 2, staffIndex: 0 },
      { customerPhone: '+919800003006', customerName: 'Neha Joshi', rating: 5, text: 'Facial left my skin glowing for a week.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001004',
    ownerName: 'Arjun Mehta',
    name: 'Serenity Spa & Wellness',
    category: 'Spa',
    description: 'Full-body massages, aromatherapy and wellness packages in a calm setting.',
    city: { name: 'Mumbai', state: 'Maharashtra' },
    lat: 19.1136,
    lng: 72.8697,
    hours: LATE_WORKING_HOURS,
    badges: ['VERIFIED', 'PREMIUM_PARTNER'],
    media: [photo('serenity-spa-1'), photo('serenity-spa-2'), photo('serenity-spa-3')],
    services: [
      { name: 'Swedish Massage (60 min)', price: 2000, durationMinutes: 60 },
      { name: 'Aromatherapy Massage (90 min)', price: 2800, durationMinutes: 90 },
      { name: 'Foot Reflexology', price: 900, durationMinutes: 40 },
    ],
    staff: [
      { name: 'Lena Fernandes', experienceYears: 7, specializations: ['Swedish massage', 'Aromatherapy'], languages: ['English', 'Hindi'] },
    ],
    reviews: [
      { customerPhone: '+919800003007', customerName: 'Karan Mehra', rating: 5, text: 'So relaxing, exactly what I needed after a long week.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001005',
    ownerName: 'Suresh Pillai',
    name: 'Royal Cuts Barbershop',
    category: 'Men',
    description: 'No-frills, fast and sharp haircuts for the working professional.',
    city: { name: 'Mumbai', state: 'Maharashtra' },
    lat: 19.033,
    lng: 72.8697,
    hours: WORKING_HOURS,
    badges: ['VERIFIED'],
    media: [photo('royal-cuts-1')],
    services: [
      { name: "Men's Haircut", price: 200, durationMinutes: 20 },
      { name: 'Beard Trim', price: 100, durationMinutes: 15 },
    ],
    staff: [{ name: 'Suresh Pillai', experienceYears: 15, specializations: ['Quick cuts'], languages: ['English', 'Hindi', 'Malayalam'] }],
    reviews: [
      { customerPhone: '+919800003008', customerName: 'Abhishek Singh', rating: 4, text: 'Quick and clean, great for a weekday trim.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001006',
    ownerName: 'Zara Khan',
    name: 'Blush Beauty Lounge',
    category: 'Women',
    description: 'Trendy hair colouring, keratin treatments and nail art studio.',
    city: { name: 'Mumbai', state: 'Maharashtra' },
    lat: 19.099,
    lng: 72.8258,
    hours: WORKING_HOURS,
    badges: ['VERIFIED', 'TOP_RATED'],
    media: [photo('blush-lounge-1'), photo('blush-lounge-2')],
    services: [
      { name: 'Global Hair Colour', price: 2500, durationMinutes: 120 },
      { name: 'Keratin Treatment', price: 3500, durationMinutes: 150 },
      { name: 'Manicure + Pedicure', price: 900, durationMinutes: 60 },
    ],
    staff: [{ name: 'Zara Khan', experienceYears: 9, specializations: ['Hair colour', 'Keratin'], languages: ['English', 'Hindi'] }],
    reviews: [
      { customerPhone: '+919800003009', customerName: 'Ishita Verma', rating: 5, text: 'My balayage turned out perfect, highly recommend Zara.', serviceIndex: 0, staffIndex: 0 },
      { customerPhone: '+919800003010', customerName: 'Priya Desai', rating: 4, text: 'Keratin made my hair so much smoother.', serviceIndex: 1, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001007',
    ownerName: 'Vikram Gowda',
    name: "UrbanFade Men's Salon",
    category: 'Men',
    description: 'Modern grooming lounge near MG Road specialising in skin fades and styling.',
    city: { name: 'Bangalore', state: 'Karnataka' },
    lat: 12.9716,
    lng: 77.5946,
    hours: LATE_WORKING_HOURS,
    badges: ['VERIFIED', 'TOP_RATED'],
    media: [photo('urbanfade-1'), photo('urbanfade-2')],
    services: [
      { name: 'Skin Fade', price: 400, durationMinutes: 35 },
      { name: "Men's Haircut", price: 300, durationMinutes: 30 },
      { name: 'Beard Styling', price: 200, durationMinutes: 20 },
    ],
    staff: [
      { name: 'Vikram Gowda', experienceYears: 11, specializations: ['Skin fades', 'Beard styling'], languages: ['English', 'Kannada', 'Hindi'] },
      { name: 'Manoj Reddy', experienceYears: 4, specializations: ['Haircuts'], languages: ['English', 'Telugu', 'Kannada'] },
    ],
    reviews: [
      { customerPhone: '+919800004001', customerName: 'Siddharth Rao', rating: 5, text: 'Best skin fade I have gotten in Bangalore.', serviceIndex: 0, staffIndex: 0 },
      { customerPhone: '+919800004002', customerName: 'Naveen Kumar', rating: 5, text: 'Clean lines, great ambience.', serviceIndex: 2, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001008',
    ownerName: 'Divya Shetty',
    name: 'Glamour Beauty Studio',
    category: 'Women',
    description: 'Koramangala-based studio for party makeup, facials and hairstyling.',
    city: { name: 'Bangalore', state: 'Karnataka' },
    lat: 12.9352,
    lng: 77.6245,
    hours: WORKING_HOURS,
    badges: ['VERIFIED'],
    media: [photo('glamour-studio-1'), photo('glamour-studio-2')],
    services: [
      { name: 'Party Makeup', price: 1800, durationMinutes: 60 },
      { name: "Women's Haircut", price: 650, durationMinutes: 45 },
      { name: 'Classic Facial', price: 750, durationMinutes: 50 },
    ],
    staff: [{ name: 'Divya Shetty', experienceYears: 8, specializations: ['Makeup', 'Facials'], languages: ['English', 'Kannada', 'Hindi'] }],
    reviews: [
      { customerPhone: '+919800004003', customerName: 'Ramya Iyer', rating: 4, text: 'Lovely makeup for my friend’s wedding.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001009',
    ownerName: 'Kiran Acharya',
    name: 'Headmasters Unisex Salon',
    category: 'Unisex',
    description: 'HSR Layout family salon — haircuts, colour and grooming for everyone.',
    city: { name: 'Bangalore', state: 'Karnataka' },
    lat: 12.9279,
    lng: 77.6271,
    hours: WORKING_HOURS,
    badges: ['VERIFIED'],
    media: [photo('headmasters-1')],
    services: [
      { name: "Men's Haircut", price: 280, durationMinutes: 30 },
      { name: "Women's Haircut", price: 600, durationMinutes: 45 },
      { name: "Kids' Haircut", price: 200, durationMinutes: 20 },
    ],
    staff: [{ name: 'Kiran Acharya', experienceYears: 6, specializations: ['Family haircuts'], languages: ['English', 'Kannada'] }],
    reviews: [
      { customerPhone: '+919800004004', customerName: 'Sandeep Hegde', rating: 4, text: 'Good for a quick family haircut outing.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001010',
    ownerName: 'Ananya Bhat',
    name: 'Tranquil Spa Bangalore',
    category: 'Spa',
    description: 'Malleswaram wellness spa offering Ayurvedic and deep-tissue massages.',
    city: { name: 'Bangalore', state: 'Karnataka' },
    lat: 13.0067,
    lng: 77.5667,
    hours: LATE_WORKING_HOURS,
    badges: ['VERIFIED', 'PREMIUM_PARTNER'],
    media: [photo('tranquil-spa-1'), photo('tranquil-spa-2')],
    services: [
      { name: 'Ayurvedic Massage (60 min)', price: 1800, durationMinutes: 60 },
      { name: 'Deep Tissue Massage (90 min)', price: 2600, durationMinutes: 90 },
    ],
    staff: [{ name: 'Ananya Bhat', experienceYears: 9, specializations: ['Ayurvedic massage'], languages: ['English', 'Kannada', 'Hindi'] }],
    reviews: [
      { customerPhone: '+919800004005', customerName: 'Meghana Rao', rating: 5, text: 'Incredibly relaxing, the Ayurvedic massage is a must-try.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
  {
    ownerPhone: '+919800001011',
    ownerName: 'Yusuf Sheikh',
    name: 'Sharp Edge Barbershop',
    category: 'Men',
    description: 'BTM Layout barbershop with a loyal regular crowd and quick turnaround.',
    city: { name: 'Bangalore', state: 'Karnataka' },
    lat: 12.9141,
    lng: 77.6412,
    hours: WORKING_HOURS,
    badges: ['VERIFIED'],
    media: [photo('sharp-edge-1')],
    services: [
      { name: "Men's Haircut", price: 250, durationMinutes: 25 },
      { name: 'Beard Trim', price: 120, durationMinutes: 15 },
    ],
    staff: [{ name: 'Yusuf Sheikh', experienceYears: 10, specializations: ['Fades', 'Beard trims'], languages: ['English', 'Kannada', 'Urdu'] }],
    reviews: [],
  },
  {
    ownerPhone: '+919800001012',
    ownerName: 'Lakshmi Narayan',
    name: 'Radiance Beauty & Bridal',
    category: 'Women',
    description: 'Indiranagar bridal specialists with in-house hairstyling and draping.',
    city: { name: 'Bangalore', state: 'Karnataka' },
    lat: 12.9719,
    lng: 77.6412,
    hours: WORKING_HOURS,
    badges: ['VERIFIED', 'FEATURED'],
    media: [photo('radiance-bridal-1'), photo('radiance-bridal-2')],
    services: [
      { name: 'Bridal Package', price: 8000, durationMinutes: 180 },
      { name: "Women's Haircut & Style", price: 700, durationMinutes: 50 },
      { name: 'Hair Spa', price: 1200, durationMinutes: 60 },
    ],
    staff: [{ name: 'Lakshmi Narayan', experienceYears: 14, specializations: ['Bridal styling', 'Draping'], languages: ['English', 'Kannada', 'Tamil'] }],
    reviews: [
      { customerPhone: '+919800004006', customerName: 'Pavithra Nair', rating: 5, text: 'Made my wedding day so much less stressful. Worth every rupee.', serviceIndex: 0, staffIndex: 0 },
    ],
  },
];

async function main() {
  for (const name of ['Men', 'Women', 'Unisex', 'Spa']) {
    const existing = await prisma.category.findFirst({ where: { name } });
    if (!existing) await prisma.category.create({ data: { name } });
  }

  const cityCache = new Map();
  async function getCity({ name, state }) {
    const key = `${name}|${state}`;
    if (cityCache.has(key)) return cityCache.get(key);
    const city = await prisma.city.upsert({
      where: { name_state: { name, state } },
      update: {},
      create: { name, state, country: 'India' },
    });
    cityCache.set(key, city);
    return city;
  }

  const seeded = [];
  for (const salon of SALONS) {
    const existingBusiness = await prisma.business.findFirst({ where: { name: salon.name } });
    if (existingBusiness) {
      seeded.push(salon.name + ' (already seeded)');
      continue;
    }

    const owner = await prisma.user.upsert({
      where: { phone: salon.ownerPhone },
      update: {},
      create: { name: salon.ownerName, phone: salon.ownerPhone, role: 'OWNER', authProvider: 'PHONE_OTP' },
    });
    const city = await getCity(salon.city);

    const business = await prisma.business.create({
      data: {
        ownerUserId: owner.id,
        name: salon.name,
        category: salon.category,
        description: salon.description,
        verificationStatus: 'VERIFIED',
        lat: salon.lat,
        lng: salon.lng,
        cityId: city.id,
        workingHours: salon.hours,
        trustBadges: { create: salon.badges.map((badgeType) => ({ badgeType, source: 'ADMIN' })) },
        media: { create: salon.media.map((url, order) => ({ url, type: 'IMAGE', order })) },
        services: { create: salon.services },
      },
      include: { services: true },
    });

    const staffRecords = [];
    for (const s of salon.staff) {
      const staff = await prisma.staff.create({
        data: {
          businessId: business.id,
          name: s.name,
          experienceYears: s.experienceYears,
          specializations: s.specializations,
          languages: s.languages,
        },
      });
      await prisma.staffAvailability.createMany({
        data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          staffId: staff.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '20:00',
        })),
      });
      staffRecords.push(staff);
    }

    // Reviews require a completed booking to hang off (unique bookingId FK),
    // so each dummy review is backed by a dummy past completed booking.
    let reviewOffsetDays = 3;
    for (const r of salon.reviews) {
      const reviewer = await prisma.user.upsert({
        where: { phone: r.customerPhone },
        update: {},
        create: { name: r.customerName, phone: r.customerPhone, role: 'CUSTOMER', authProvider: 'PHONE_OTP' },
      });
      await prisma.customerProfile.upsert({
        where: { userId: reviewer.id },
        update: {},
        create: { userId: reviewer.id },
      });

      const service = business.services[r.serviceIndex] ?? business.services[0];
      const staff = staffRecords[r.staffIndex] ?? staffRecords[0];
      const slotStart = new Date(Date.now() - reviewOffsetDays * 24 * 60 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60 * 1000);
      reviewOffsetDays += 2;

      const booking = await prisma.booking.create({
        data: {
          customerId: reviewer.id,
          businessId: business.id,
          staffId: staff?.id,
          serviceId: service.id,
          slotStart,
          slotEnd,
          status: 'COMPLETED',
        },
      });

      await prisma.review.create({
        data: {
          bookingId: booking.id,
          customerId: reviewer.id,
          businessId: business.id,
          staffId: staff?.id,
          rating: r.rating,
          text: r.text,
        },
      });
    }

    seeded.push(salon.name);
  }

  // Keep the original demo accounts/customer working for manual login testing.
  const customer = await prisma.user.upsert({
    where: { phone: '+919800000002' },
    update: {},
    create: { name: 'Anita Customer', phone: '+919800000002', role: 'CUSTOMER', authProvider: 'PHONE_OTP' },
  });
  await prisma.customerProfile.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id },
  });

  // Admin role can't self-register (FR-1.2) — seed a login-ready account here.
  await prisma.user.upsert({
    where: { phone: '+919800000099' },
    update: {},
    create: { name: 'Trimly Admin', phone: '+919800000099', role: 'ADMIN', authProvider: 'PHONE_OTP' },
  });

  console.log('Seeded salons:', seeded);
  console.log('Admin login phone: +919800000099 (use the normal OTP login — devOtp shows in dev)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
