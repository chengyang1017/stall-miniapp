// Built-in vector assets only. Never accept arbitrary image URLs as icon keys.
export const CATEGORY_ICONS = [
  {key:'grid',label:'全部',path:'/assets/category-icons/grid.svg',activePath:'/assets/category-icons/grid-white.svg'},
  {key:'drink',label:'饮料',path:'/assets/category-icons/drink.svg',activePath:'/assets/category-icons/drink-white.svg'},
  {key:'bowl',label:'食物',path:'/assets/category-icons/bowl.svg',activePath:'/assets/category-icons/bowl-white.svg'},
  {key:'snack',label:'零食',path:'/assets/category-icons/snack.svg',activePath:'/assets/category-icons/snack-white.svg'},
  {key:'bottle',label:'日用品',path:'/assets/category-icons/bottle.svg',activePath:'/assets/category-icons/bottle-white.svg'},
  {key:'apple',label:'生鲜水果',path:'/assets/category-icons/apple.svg',activePath:'/assets/category-icons/apple-white.svg'},
  {key:'snowflake',label:'冷冻食品',path:'/assets/category-icons/snowflake.svg',activePath:'/assets/category-icons/snowflake-white.svg'},
  {key:'cloche',label:'熟食',path:'/assets/category-icons/cloche.svg',activePath:'/assets/category-icons/cloche-white.svg'},
  {key:'cake',label:'甜品',path:'/assets/category-icons/cake.svg',activePath:'/assets/category-icons/cake-white.svg'},
  {key:'noodle',label:'面食',path:'/assets/category-icons/noodle.svg',activePath:'/assets/category-icons/noodle-white.svg'},
  {key:'rice',label:'米饭主食',path:'/assets/category-icons/rice.svg',activePath:'/assets/category-icons/rice-white.svg'},
  {key:'lunchbox',label:'便当',path:'/assets/category-icons/lunchbox.svg',activePath:'/assets/category-icons/lunchbox-white.svg'},
  {key:'fries',label:'小吃',path:'/assets/category-icons/fries.svg',activePath:'/assets/category-icons/fries-white.svg'},
  {key:'sunrise',label:'早餐',path:'/assets/category-icons/sunrise.svg',activePath:'/assets/category-icons/sunrise-white.svg'},
  {key:'coffee',label:'咖啡',path:'/assets/category-icons/coffee.svg',activePath:'/assets/category-icons/coffee-white.svg'},
  {key:'bubble-tea',label:'奶茶',path:'/assets/category-icons/bubble-tea.svg',activePath:'/assets/category-icons/bubble-tea-white.svg'},
  {key:'bread',label:'烘焙',path:'/assets/category-icons/bread.svg',activePath:'/assets/category-icons/bread-white.svg'},
  {key:'seasoning',label:'调味品',path:'/assets/category-icons/seasoning.svg',activePath:'/assets/category-icons/seasoning-white.svg'},
  {key:'wine',label:'酒水',path:'/assets/category-icons/wine.svg',activePath:'/assets/category-icons/wine-white.svg'},
  {key:'more',label:'其他',path:'/assets/category-icons/more.svg',activePath:'/assets/category-icons/more-white.svg'},
  {key:'shirt',label:'服装',path:'/assets/category-icons/shirt.svg',activePath:'/assets/category-icons/shirt-white.svg'},
  {key:'shoes',label:'鞋靴',path:'/assets/category-icons/shoes.svg',activePath:'/assets/category-icons/shoes-white.svg'},
  {key:'bag',label:'箱包',path:'/assets/category-icons/bag.svg',activePath:'/assets/category-icons/bag-white.svg'},
  {key:'phone',label:'手机数码',path:'/assets/category-icons/phone.svg',activePath:'/assets/category-icons/phone-white.svg'},
  {key:'laptop',label:'电脑办公',path:'/assets/category-icons/laptop.svg',activePath:'/assets/category-icons/laptop-white.svg'},
  {key:'headphones',label:'影音设备',path:'/assets/category-icons/headphones.svg',activePath:'/assets/category-icons/headphones-white.svg'},
  {key:'beauty',label:'美妆护肤',path:'/assets/category-icons/beauty.svg',activePath:'/assets/category-icons/beauty-white.svg'},
  {key:'jewelry',label:'珠宝饰品',path:'/assets/category-icons/jewelry.svg',activePath:'/assets/category-icons/jewelry-white.svg'},
  {key:'baby',label:'母婴用品',path:'/assets/category-icons/baby.svg',activePath:'/assets/category-icons/baby-white.svg'},
  {key:'toys',label:'玩具模型',path:'/assets/category-icons/toys.svg',activePath:'/assets/category-icons/toys-white.svg'},
  {key:'books',label:'图书读物',path:'/assets/category-icons/books.svg',activePath:'/assets/category-icons/books-white.svg'},
  {key:'stationery',label:'文具用品',path:'/assets/category-icons/stationery.svg',activePath:'/assets/category-icons/stationery-white.svg'},
  {key:'furniture',label:'家具家居',path:'/assets/category-icons/furniture.svg',activePath:'/assets/category-icons/furniture-white.svg'},
  {key:'lamp',label:'灯具照明',path:'/assets/category-icons/lamp.svg',activePath:'/assets/category-icons/lamp-white.svg'},
  {key:'tools',label:'五金工具',path:'/assets/category-icons/tools.svg',activePath:'/assets/category-icons/tools-white.svg'},
  {key:'garden',label:'花卉园艺',path:'/assets/category-icons/garden.svg',activePath:'/assets/category-icons/garden-white.svg'},
  {key:'pets',label:'宠物用品',path:'/assets/category-icons/pets.svg',activePath:'/assets/category-icons/pets-white.svg'},
  {key:'sports',label:'运动健身',path:'/assets/category-icons/sports.svg',activePath:'/assets/category-icons/sports-white.svg'},
  {key:'outdoor',label:'户外旅行',path:'/assets/category-icons/outdoor.svg',activePath:'/assets/category-icons/outdoor-white.svg'},
  {key:'auto',label:'汽车用品',path:'/assets/category-icons/auto.svg',activePath:'/assets/category-icons/auto-white.svg'},
  {key:'medicine',label:'健康护理',path:'/assets/category-icons/medicine.svg',activePath:'/assets/category-icons/medicine-white.svg'},
  {key:'gift',label:'礼品包装',path:'/assets/category-icons/gift.svg',activePath:'/assets/category-icons/gift-white.svg'},
  {key:'craft',label:'手工艺术',path:'/assets/category-icons/craft.svg',activePath:'/assets/category-icons/craft-white.svg'},
  {key:'digital',label:'虚拟商品',path:'/assets/category-icons/digital.svg',activePath:'/assets/category-icons/digital-white.svg'}
] as const
export type CategoryIconKey = typeof CATEGORY_ICONS[number]['key']
export function validCategoryIconKey(value:unknown):value is CategoryIconKey {return typeof value==='string'&&CATEGORY_ICONS.some(icon=>icon.key===value)}
export function resolveCategoryIcon(category:{id?:string;name?:string;iconKey?:unknown}):CategoryIconKey {
  if(validCategoryIconKey(category.iconKey))return category.iconKey
  return 'grid'
}
export function categoryIconView(category:{id?:string;name?:string;iconKey?:unknown}) {
  const resolvedIconKey=resolveCategoryIcon(category),icon=CATEGORY_ICONS.find(item=>item.key===resolvedIconKey)!
  return {resolvedIconKey,iconPath:icon.path,iconActivePath:icon.activePath,iconLabel:icon.label}
}
