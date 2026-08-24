import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_HOURS = {
  mon: { open: '10:00', close: '23:00' },
  tue: { open: '10:00', close: '23:00' },
  wed: { open: '10:00', close: '23:00' },
  thu: { open: '10:00', close: '23:00' },
  fri: { open: '10:00', close: '02:00' },
  sat: { open: '12:00', close: '02:00' },
  sun: { open: '12:00', close: '22:00' },
};

type SeedVenue = {
  email: string;
  name: string;
  description: string;
  category: string;
  phone: string;
  instagram: string;
  lat: number;
  lng: number;
  logoUrl: string;
  coverUrl: string;
  promoImageUrl: string;
  promoTitle: string;
  promoDescription: string;
};

const VENUES: SeedVenue[] = [
  {
    email: 'boteco.central@after.local',
    name: 'Boteco Central',
    description: 'Petiscos, chope gelado e samba no centro.',
    category: 'Bar e Petiscaria',
    phone: '(11) 91111-0001',
    instagram: '@botecocentral',
    lat: -23.5505,
    lng: -46.6333,
    logoUrl:
      'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800',
    promoTitle: 'Chope em dobro até 20h',
    promoDescription: 'Na compra de um chope, o segundo sai por conta da casa.',
  },
  {
    email: 'sushi.nori@after.local',
    name: 'Sushi Nori',
    description: 'Combinados frescos e rodízio à noite.',
    category: 'Restaurante Japonês',
    phone: '(11) 91111-0002',
    instagram: '@sushinori',
    lat: -23.5614,
    lng: -46.6559,
    logoUrl:
      'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=800',
    promoTitle: 'Combo 30 peças por R$ 59',
    promoDescription: 'Combinado especial com sashimi, uramaki e hot roll.',
  },
  {
    email: 'burger.garage@after.local',
    name: 'Burger Garage',
    description: 'Smash burgers artesanais e milkshakes.',
    category: 'Hamburgueria',
    phone: '(11) 91111-0003',
    instagram: '@burgergarage',
    lat: -23.5577,
    lng: -46.6623,
    logoUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
    promoTitle: '2 burgers + batata por R$ 49',
    promoDescription: 'Dois smash burgers artesanais com porção de batata.',
  },
  {
    email: 'cafe.aurora@after.local',
    name: 'Café Aurora',
    description: 'Café especial, brunch e sobremesas.',
    category: 'Café',
    phone: '(11) 91111-0004',
    instagram: '@cafeaurora',
    lat: -23.5489,
    lng: -46.6388,
    logoUrl:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    promoTitle: 'Brunch completo 20% off',
    promoDescription: 'Café especial, pães e ovos com desconto no brunch.',
  },
  {
    email: 'pizzaria.forno@after.local',
    name: 'Pizzaria Forno Alto',
    description: 'Pizza napolitana em forno a lenha.',
    category: 'Pizzaria',
    phone: '(11) 91111-0005',
    instagram: '@fornoalto',
    lat: -23.5672,
    lng: -46.6488,
    logoUrl:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
    promoTitle: 'Pizza grande + refrigerante R$ 69',
    promoDescription: 'Pizza napolitana grande acompanhada de refrigerante.',
  },
  {
    email: 'casa.show.luz@after.local',
    name: 'Casa de Show Luz',
    description: 'Shows ao vivo, open bar e pista.',
    category: 'Casa de show',
    phone: '(11) 91111-0006',
    instagram: '@casaluz',
    lat: -23.5445,
    lng: -46.6445,
    logoUrl:
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    promoTitle: 'Lista VIP liberada até 23h',
    promoDescription: 'Entrada na lista VIP sem custo até as 23h.',
  },
  {
    email: 'churrasco.gaucho@after.local',
    name: 'Churrasco Gaúcho',
    description: 'Cortes nobres e rodízio completo.',
    category: 'Churrascaria',
    phone: '(11) 91111-0007',
    instagram: '@churrascogaucho',
    lat: -23.5731,
    lng: -46.6412,
    logoUrl:
      'https://images.unsplash.com/photo-1529193595785-44bcd67eec0d?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
    promoTitle: 'Rodízio freestyle R$ 89',
    promoDescription: 'Cortes nobres à vontade no rodízio completo.',
  },
  {
    email: 'acai.tropical@after.local',
    name: 'Açaí Tropical',
    description: 'Açaí, bowls e vitaminas naturais.',
    category: 'Açaíteria',
    phone: '(11) 91111-0008',
    instagram: '@acaitropical',
    lat: -23.5528,
    lng: -46.657,
    logoUrl:
      'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1488900123121-2340e1f8bfad?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800',
    promoTitle: 'Açaí 700ml por R$ 19,90',
    promoDescription: 'Açaí cremoso no tamanho grande com duas toppings.',
  },
  {
    email: 'pasta.roma@after.local',
    name: 'Pasta Roma',
    description: 'Massas frescas e vinhos italianos.',
    category: 'Restaurante Italiano',
    phone: '(11) 91111-0009',
    instagram: '@pastaroma',
    lat: -23.5589,
    lng: -46.6671,
    logoUrl:
      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800',
    promoTitle: 'Massa + vinho da casa R$ 79',
    promoDescription: 'Massa fresca do dia acompanhada de taça de vinho.',
  },
  {
    email: 'lanchonete.express@after.local',
    name: 'Lanchonete Express',
    description: 'Lanches rápidos, porções e delivery.',
    category: 'Lanchonete',
    phone: '(11) 91111-0010',
    instagram: '@lanchexpress',
    lat: -23.5462,
    lng: -46.6392,
    logoUrl:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200',
    coverUrl:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    promoImageUrl:
      'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800',
    promoTitle: 'Combo X-Bacon + refri R$ 29',
    promoDescription: 'X-bacon, batata pequena e refrigerante lata.',
  },
];

function todayUtcDate() {
  const today = new Date();
  return new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
}

async function upsertVenue(seed: SeedVenue, passwordHash: string, day: Date) {
  const user = await prisma.user.upsert({
    where: { email: seed.email },
    update: {
      name: seed.name,
      city: 'São Paulo',
      state: 'SP',
    },
    create: {
      name: seed.name,
      email: seed.email,
      passwordHash,
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      venue: {
        create: {
          name: seed.name,
          description: seed.description,
          category: seed.category,
          city: 'São Paulo',
          state: 'SP',
          lat: seed.lat,
          lng: seed.lng,
          logoUrl: seed.logoUrl,
          coverUrl: seed.coverUrl,
          contacts: {
            phone: seed.phone,
            instagram: seed.instagram,
            whatsapp: seed.phone.replace(/\D/g, ''),
          },
          hoursJson: DEFAULT_HOURS,
          wallet: { create: { balance: 20 } },
        },
      },
    },
    include: { venue: true },
  });

  let venue = user.venue;
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        ownerUserId: user.id,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        city: 'São Paulo',
        state: 'SP',
        lat: seed.lat,
        lng: seed.lng,
        logoUrl: seed.logoUrl,
        coverUrl: seed.coverUrl,
        contacts: {
          phone: seed.phone,
          instagram: seed.instagram,
          whatsapp: seed.phone.replace(/\D/g, ''),
        },
        hoursJson: DEFAULT_HOURS,
        wallet: { create: { balance: 20 } },
      },
    });
  } else {
    venue = await prisma.venue.update({
      where: { id: venue.id },
      data: {
        name: seed.name,
        description: seed.description,
        category: seed.category,
        logoUrl: seed.logoUrl,
        coverUrl: seed.coverUrl,
        lat: seed.lat,
        lng: seed.lng,
        contacts: {
          phone: seed.phone,
          instagram: seed.instagram,
          whatsapp: seed.phone.replace(/\D/g, ''),
        },
        hoursJson: DEFAULT_HOURS,
      },
    });
  }

  await prisma.creditWallet.upsert({
    where: { venueId: venue.id },
    create: { venueId: venue.id, balance: 20 },
    update: { balance: 20 },
  });

  const existingPromo = await prisma.banner.findFirst({
    where: {
      venueId: venue.id,
      schedules: { some: { displayDate: day } },
    },
  });

  if (!existingPromo) {
    await prisma.banner.create({
      data: {
        venueId: venue.id,
        imageUrl: seed.promoImageUrl,
        title: seed.promoTitle,
        description: seed.promoDescription,
        creditsCost: 1,
        status: 'ACTIVE',
        schedules: {
          create: {
            displayDate: day,
            citySnapshot: 'São Paulo',
          },
        },
      },
    });
  } else {
    await prisma.banner.update({
      where: { id: existingPromo.id },
      data: {
        imageUrl: seed.promoImageUrl,
        title: seed.promoTitle,
        description: seed.promoDescription,
        status: 'ACTIVE',
      },
    });
  }

  return seed;
}

async function main() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const day = todayUtcDate();

  for (const venue of VENUES) {
    await upsertVenue(venue, passwordHash, day);
  }

  // Alias legado do primeiro seed
  await prisma.user.upsert({
    where: { email: 'bar@after.local' },
    update: {},
    create: {
      name: 'Bar After Demo',
      email: 'bar@after.local',
      passwordHash,
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      venue: {
        create: {
          name: 'Bar After Demo',
          description: 'Conta legado — use boteco.central@after.local',
          category: 'Bar e Petiscaria',
          city: 'São Paulo',
          state: 'SP',
          wallet: { create: { balance: 10 } },
        },
      },
    },
  });

  await prisma.user.upsert({
    where: { email: 'user@after.local' },
    update: {},
    create: {
      name: 'Usuário Demo',
      email: 'user@after.local',
      passwordHash,
      role: Role.USER,
      state: 'SP',
      city: 'São Paulo',
    },
  });

  console.log('Seed ok — 10 estabelecimentos em São Paulo com promoções do dia');
  console.log('');
  console.log('Usuário comum: user@after.local / senha123');
  console.log('Senha de todos os estabelecimentos: senha123');
  console.log('');
  for (const v of VENUES) {
    console.log(`- ${v.name.padEnd(22)} ${v.email} | ${v.promoTitle}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
