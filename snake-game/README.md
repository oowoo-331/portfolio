# 霓虹贪吃蛇

双击 `index.html` 就能玩。不需要装任何东西，断网也能跑。

```
snake-game/
├── index.html   页面骨架（有什么元素）
├── style.css    长什么样（配色、布局、动画）
├── game.js      游戏逻辑（怎么跑起来的）
└── README.md    这份文档
```

---

## 一、六个核心原理

### 1. 网格坐标，而不是像素坐标

蛇的位置记的是**第几格**（`{x: 5, y: 10}`），不是"第几像素"。

```js
const COLS = 20;   // 20 列
const CELL = 24;   // 每格 24 像素
// 画的时候才换算成像素
const px = seg.x * CELL;
```

**为什么**：如果用像素，判断"蛇头有没有碰到食物"要算距离、要处理误差。用格子就变成了简单的 `head.x === food.x && head.y === food.y`。碰撞检测、边界判断全都被简化成整数比较。

这是游戏开发里最常用的技巧：**先在抽象的格子里算逻辑，最后一步再换算去画**。

### 2. 游戏循环：刷新率和游戏速度是两件事

```js
function loop(timestamp) {
  if (state === 'running') {
    const interval = 1000 / currentSpeed();
    if (timestamp - lastTick >= interval) {   // 时间够了吗?
      lastTick = timestamp;
      step();                                  // 够了一次就走一格
    }
  }
  draw();                                      // 但每一帧都重画
  requestAnimationFrame(loop);
}
```

`requestAnimationFrame` 每秒回调约 60 次（跟着屏幕刷新率走）。但蛇每秒只走 7 格。
所以：**每帧都画**（画面才流畅），**但只在累计时间够了才走一格**（速度才可控）。

想吃食物加速？不用改循环，只要 `currentSpeed()` 返回更大的数，`interval` 自然变小。

### 3. 蛇就是一个数组：头部插入 + 尾部删除

```js
snake.unshift(head);   // 新头插到最前面
snake.pop();           // 删掉尾巴
```

这两行就是"蛇在前进"的全部秘密。**没吃到食物时**加一个头删一个尾，长度不变、整体前移；**吃到食物时**只加头不删尾，长度 +1。

数据结构课讲的队列、双端队列（deque），这就是真实例子。

### 4. 碰撞检测里那个容易踩的坑

```js
const willGrow = head.x === food.x && head.y === food.y;
const body = willGrow ? snake : snake.slice(0, -1);
if (body.some(s => s.x === head.x && s.y === head.y)) gameOver();
```

**为什么要用 `slice(0, -1)` 把尾巴去掉？**

因为这一帧尾巴会让开。想象蛇长 3 节，头在第 2 节旁边——如果头要移动到"当前尾巴所在的位置"，尾巴同时也在往前进方向退，那是**安全的**，不该判死。

只有吃到食物（尾巴不动）时，才需要把尾巴也算进障碍。这个 bug 不仔细想很容易漏。

### 5. 输入为什么要排队

```js
let inputQueue = [];
function queueDir(nx, ny) {
  const last = inputQueue.length ? inputQueue[inputQueue.length - 1] : dir;
  if (nx === -last.x && ny === -last.y) return;   // 禁止 180 度掉头
  inputQueue.push({ x: nx, y: ny });
}
```

假设蛇正向右走，你手快，在一帧内按了「上」再按「左」：

- **直接改 dir**：最后 `dir = 左`，而蛇还在向右 → 直接撞死。玩家会觉得"我明明按的是上啊"。
- **用队列**：先走上，下一格再走左 → 符合预期。

只判断"不能和当前方向相反"是不够的，必须和**队列里最后一个方向**比。

### 6. localStorage：关掉浏览器也记得

```js
let best = Number(localStorage.getItem('snake-best') || 0);
localStorage.setItem('snake-best', String(best));
```

浏览器提供的一小块本地存储（每个网站约 5MB），存的是字符串，所以取出来要用 `Number()` 转，存进去要用 `String()` 转。

---

## 二、动手改（从易到难）

别只是看，改一遍才是你的。建议按顺序做：

**① 改配置和配色**（5 分钟）
`game.js` 顶部的 `COLS` / `ROWS` / `CELL` / `BASE_SPEED` 都改一遍，看看发生什么。再到 `style.css` 里把 `#4ade80`（绿色）换成别的颜色。

**② 加分规则**（15 分钟）
现在吃一个食物 +1 分。改成：得分 = 食物基础分 × 当前速度倍率，让后期更刺激。

**③ 加障碍物**（30 分钟）
蛇越长越难，但地图是空的。试着在中间放几个固定障碍格，撞上就死。
提示：加一个 `obstacles = [{x,y}, ...]` 数组，在 `placeFood()` 和碰撞检测里都要排除它们。

**④ 限时模式**（30 分钟）
每局 60 秒倒计时，时间到就结算。提示：在 `loop()` 里用同样的"累计时间"思路。

**⑤ 性能优化**（1 小时，有挑战）
现在 `placeFood()` 是**随机撞运气**——蛇快占满整张地图时，可能要试几百次才找到空位。
改法：维护一个"所有空格"的列表，吃食物时从列表里删、蛇移动时更新，随机时直接取一个。这是把 O(不确定) 变成 O(1) 的典型优化。

做完其中任意两个，你就比大多数大一学生强了。

---

## 三、发布到网上

现在只有你自己能玩。发布之后，发给同学一个链接就能玩。

**最省事的办法**：把 `snake-game` 文件夹整个拖到 [app.netlify.com/drop](https://app.netlify.com/drop)，几秒钟就有一个公开网址，免费。

**更正规的办法**（推荐，顺便学 Git，软工必备）：
1. 注册 GitHub，新建仓库
2. 把这三个文件传上去
3. 仓库 Settings → Pages → 选 main 分支
4. 得到 `你的用户名.github.io/仓库名`

第二种方式要学 Git 命令，但这东西你迟早要会，越早越好。

---

## 四、接下来能长成什么样

这个游戏可以顺着长成你的第一个正经项目：

- 加**排行榜**（需要后端，你就自然学会服务器和数据库）
- 加**用户登录**（学会会话和鉴权）
- 用 **TypeScript** 重写（学会类型，写大项目的必备）
- 套个框架（**React / Vue**）重构（学会组件化）

每一步都是简历上能写的东西。
