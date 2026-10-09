/**
 * VISUAL PREVIEW ONLY.
 * These merchants, ratings, promotions, prices and distances are synthetic composition
 * fixtures for approved mockup reconstruction. They must never be sent to checkout,
 * persisted as an order, or presented as verified live serviceability information.
 * Phase 2 replaces this file with typed backend view-model adapters.
 */

export type Cuisine =
  | "Burgers" | "Pizza" | "Chicken" | "Local" | "Healthy" | "Drinks" | "Snacks" | "Desserts";

export type PreviewRestaurant = {
  id: string;
  name: string;
  cuisines: Cuisine[];
  image: string;
  imageAlt: string;
  rating: number;
  reviews: number;
  time: [number, number];
  feeKsh: number;
  distanceKm: number;
  badge?: string;
  badgeColor?: "red" | "mint";
  promo?: string;
  featured?: boolean;
};

const photo = (id: string, width = 660) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;

export const heroBurger = photo("photo-1550547660-d9450f859349", 980);

export const previewRestaurants: PreviewRestaurant[] = [
  {
    id: "smash", name: "Smash Burger", cuisines: ["Burgers", "Snacks"],
    image: photo("photo-1568901346375-23c9450c58cd"),
    imageAlt: "Juicy cheeseburger in a toasted bun",
    rating: 4.6, reviews: 320, time: [20, 30], feeKsh: 100, distanceKm: 1.2,
    badge: "Featured", badgeColor: "red", promo: "Free delivery", featured: true,
  },
  {
    id: "pizza", name: "Pizza Palace", cuisines: ["Pizza"],
    image: photo("photo-1574071318508-1cdbab80d002"),
    imageAlt: "Fresh oven-baked pizza with vegetables",
    rating: 4.5, reviews: 280, time: [25, 35], feeKsh: 150, distanceKm: 1.8,
    promo: "10% off",
  },
  {
    id: "juja-grill", name: "Juja Grill House", cuisines: ["Chicken", "Local"],
    image: photo("photo-1532550907401-a500c9a57435"),
    imageAlt: "Golden grilled chicken with a savory sauce",
    rating: 4.7, reviews: 412, time: [25, 35], feeKsh: 120, distanceKm: 1.5,
    badge: "Popular", badgeColor: "mint", promo: "Free delivery",
  },
  {
    id: "wok-roll", name: "Wok & Roll", cuisines: ["Local", "Healthy"],
    image: photo("photo-1569718212165-3a8278d5f624"),
    imageAlt: "Bowl of freshly prepared noodles and vegetables",
    rating: 4.4, reviews: 190, time: [30, 40], feeKsh: 150, distanceKm: 2.1,
  },
  {
    id: "healthy", name: "Healthy Bites", cuisines: ["Healthy"],
    image: photo("photo-1512621776951-a57141f2eefd"),
    imageAlt: "Colorful green salad with cherry tomatoes",
    rating: 4.3, reviews: 120, time: [20, 35], feeKsh: 120, distanceKm: 1.7,
  },
  {
    id: "chicken", name: "Chick’n Go", cuisines: ["Chicken", "Snacks"],
    image: photo("photo-1562967914-608f82629710"),
    imageAlt: "Crunchy golden fried chicken",
    rating: 4.5, reviews: 220, time: [25, 40], feeKsh: 130, distanceKm: 2.3,
  },
  {
    id: "sweet", name: "Sweet Spot", cuisines: ["Desserts", "Drinks"],
    image: photo("photo-1488477181946-6428a0291777"),
    imageAlt: "Sweet chilled dessert with fruit",
    rating: 4.4, reviews: 98, time: [20, 30], feeKsh: 100, distanceKm: 1.3,
  },
  {
    id: "brew", name: "Brew & Bites", cuisines: ["Drinks", "Snacks"],
    image: photo("photo-1509042239860-f550ce710b93"),
    imageAlt: "Warm latte in a cafe cup",
    rating: 4.6, reviews: 156, time: [20, 25], feeKsh: 90, distanceKm: 1.1,
  },
];

export const categories: Array<{label: "All" | Cuisine; icon: string}> = [
  { label:"All", icon:"🍽" },
  { label:"Burgers", icon:"🍔" },
  { label:"Pizza", icon:"🍕" },
  { label:"Chicken", icon:"🍗" },
  { label:"Local", icon:"🍲" },
  { label:"Healthy", icon:"🥬" },
  { label:"Drinks", icon:"🥤" },
  { label:"Snacks", icon:"🍟" },
  { label:"Desserts", icon:"🧁" },
];

export const previewLocation = {
  shortLabel: "Home",
  district: "Juja, Kiambu County",
};
