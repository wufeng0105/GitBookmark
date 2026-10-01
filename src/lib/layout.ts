/**
 * 页面内容容器：收藏页与设置与数据页共用的自适应宽度阶梯。
 * 随视口逐级放宽（sm 48rem → 2xl 80rem），居中留白由 mx-auto 均分，
 * 不再写死单一像素宽度——宽屏自动利用横向空间，窄屏自然收缩。
 */
export const PAGE_CONTAINER = 'mx-auto w-full max-w-3xl px-6 xl:max-w-5xl 2xl:max-w-7xl'
