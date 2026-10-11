const prisma = require("../src/lib/prisma");

async function main() {
  const vehicles = [
    {
      data: {
        slug: "gazelle-next-4-2",
        name: "Газель NEXT 4.2 м",
        shortDescription: "Для переездов, мебели, техники и бытовых грузов.",
        description: "Универсальный закрытый фургон для квартирных и офисных переездов, перевозки мебели, бытовой техники, коробок и других грузов по Абакану и Хакасии.",
        specsDescription: "Размер кузова подходит для большинства городских перевозок и переездов, а закрытый фургон защищает вещи от осадков и грязи.",
        cargoDescription: "Газель NEXT подойдёт для частных переездов, доставки покупок, перевозки оборудования и регулярных задач бизнеса.",
        cargoItems: "Мебель и предметы интерьера\nБытовая техника\nКоробки и личные вещи\nСтройматериалы\nОборудование и инструменты\nТовары для бизнеса",
        serviceArea: "Абакан и Хакасия",
        previewImage: "/site/img/fleet-next.webp",
        capacityKg: 1500,
        volumeM3: 18,
        bodyLengthM: 4.2,
        bodyWidthM: 2.1,
        bodyHeightM: 2.1,
        bodyType: "Фургон",
        loadingType: "Задняя",
        categories: "переезды,мебель,техника",
        ownershipType: "OWN",
        status: "AVAILABLE",
        published: true,
        sortOrder: 10
      },
      images: [
        ["/site/img/car-next-main.webp", "Газель NEXT 4.2 м компании Свои грузы"],
        ["/site/img/car-next-side.webp", "Газель NEXT, вид сбоку"],
        ["/site/img/car-next-night.webp", "Газель NEXT в вечернее время"],
        ["/site/img/car-next-brand.webp", "Фирменная графика Свои грузы на кузове автомобиля"]
      ]
    },
    {
      data: {
        slug: "tent-van",
        name: "Тентованный фургон",
        shortDescription: "Для габаритных и нестандартных грузов с защитой от непогоды.",
        description: "Тентованный автомобиль для объёмных грузов, коммерческих перевозок и задач, где важна удобная погрузка.",
        specsDescription: "Характеристики автомобиля заполняются и редактируются из панели управления.",
        cargoDescription: "Подходит для объёмных грузов и коммерческих перевозок.",
        cargoItems: "Габаритные грузы\nСтройматериалы\nОборудование\nТовары для бизнеса",
        serviceArea: "Абакан и Хакасия",
        previewImage: "/site/img/fleet-tent.webp",
        capacityKg: 3000,
        volumeM3: 28,
        bodyLengthM: 6.2,
        bodyType: "Тент",
        categories: "габаритные грузы,бизнес",
        ownershipType: "OWN",
        status: "AVAILABLE",
        published: true,
        sortOrder: 20
      },
      images: [["/site/img/fleet-tent.webp", "Тентованный фургон компании Свои грузы"]]
    },
    {
      data: {
        slug: "board-gazelle",
        name: "Бортовая Газель",
        shortDescription: "Для стройматериалов, техники, длинномеров и нестандартных грузов.",
        description: "Бортовой автомобиль для стройматериалов, оборудования, длинномерных и нестандартных грузов.",
        specsDescription: "Открытый борт удобен для боковой и верхней погрузки нестандартных грузов.",
        cargoDescription: "Подходит для строительных материалов, оборудования и длинномерных грузов.",
        cargoItems: "Стройматериалы\nОборудование\nИнструменты\nДлинномерные грузы",
        serviceArea: "Абакан и Хакасия",
        previewImage: "/site/img/fleet-board.webp",
        capacityKg: 1500,
        bodyLengthM: 4.2,
        bodyType: "Бортовой",
        loadingType: "Боковая / верхняя",
        categories: "стройматериалы,оборудование",
        ownershipType: "OWN",
        status: "AVAILABLE",
        published: true,
        sortOrder: 30
      },
      images: [["/site/img/fleet-board.webp", "Бортовая Газель компании Свои грузы"]]
    }
  ];

  for (const item of vehicles) {
    const vehicle = await prisma.vehicle.upsert({
      where: { slug: item.data.slug },
      update: item.data,
      create: item.data
    });
    await prisma.vehicleImage.deleteMany({ where: { vehicleId: vehicle.id } });
    if (item.images.length) {
      await prisma.vehicleImage.createMany({
        data: item.images.map(([image, alt], index) => ({
          vehicleId: vehicle.id,
          image,
          alt,
          sortOrder: index * 10
        }))
      });
    }
  }

  console.log("Автопарк: 3 машины добавлены/обновлены.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
