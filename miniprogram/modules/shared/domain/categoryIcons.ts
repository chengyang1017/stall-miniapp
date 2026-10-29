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
  {key:'more',label:'其他',path:'/assets/category-icons/more.svg',activePath:'/assets/category-icons/more-white.svg'}
] as const
export type CategoryIconKey = typeof CATEGORY_ICONS[number]['key']
export function validCategoryIconKey(value:unknown):value is CategoryIconKey {return typeof value==='string'&&CATEGORY_ICONS.some(icon=>icon.key===value)}
const NAME_ICONS:Array<[RegExp,CategoryIconKey]>=[[/奶茶|珍珠|bubble.?tea|boba/i,'bubble-tea'],[/咖啡|coffee/i,'coffee'],[/冷冻|冰冻|frozen|ice.?cream/i,'snowflake'],[/水果|生鲜|果蔬|fruit|fresh/i,'apple'],[/甜品|蛋糕|dessert|cake/i,'cake'],[/早餐|早饭|breakfast/i,'sunrise'],[/面食|面条|粉面|noodle|pasta/i,'noodle'],[/便当|饭盒|lunch.?box|bento/i,'lunchbox'],[/米饭|主食|米食|rice/i,'rice'],[/烘焙|面包|糕点|bread|bakery/i,'bread'],[/调味|酱料|seasoning|sauce/i,'seasoning'],[/酒水|啤酒|葡萄酒|wine|beer|alcohol/i,'wine'],[/饮料|饮品|果汁|drink|beverage|juice/i,'drink'],[/零食|饼干|snack|cookie/i,'snack'],[/日用|清洁|生活|household|daily/i,'bottle'],[/熟食|热食|cooked|deli/i,'cloche'],[/小吃|炸物|fries|street.?food/i,'fries'],[/食物|食品|餐食|food|meal/i,'bowl'],[/^全部|^all$/i,'grid'],[/其他|其它|other|misc/i,'more']]
export function resolveCategoryIcon(category:{id?:string;name?:string;iconKey?:unknown}):CategoryIconKey {
  if(validCategoryIconKey(category.iconKey))return category.iconKey
  const match=NAME_ICONS.find(([pattern])=>pattern.test(category.name||''));if(match)return match[1]
  const seed=category.name||category.id||'category';let hash=0;for(let i=0;i<seed.length;i++)hash=(hash*31+seed.charCodeAt(i))>>>0
  return CATEGORY_ICONS[1+hash%(CATEGORY_ICONS.length-1)].key
}
export function categoryIconView(category:{id?:string;name?:string;iconKey?:unknown}) {
  const resolvedIconKey=resolveCategoryIcon(category),icon=CATEGORY_ICONS.find(item=>item.key===resolvedIconKey)!
  return {resolvedIconKey,iconPath:icon.path,iconActivePath:icon.activePath,iconLabel:icon.label}
}
