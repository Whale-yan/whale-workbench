/* ============================================
   鲸鱼工作台 - 主应用逻辑
   ============================================ */

/* ===== 数据层 ===== */
var STORE_KEY = 'whale_workbench_data';

function getDefaultData() {
  return {
    version: 1,
    // 积分双体系
    totalXP: 0,          // 累计经验值（只增不减，定等级）
    availablePoints: 0,  // 可用余额（可消费）
    // 等级
    level: 1,
    // 连续打卡
    streak: 0,           // 当前连续天数
    lastCheckIn: null,   // 上次打卡日期 (YYYY-MM-DD)
    // 任务
    tasks: [],           // 所有任务定义 {id, name, points, period, tag, createdAt}
    taskRecords: {},     // 任务完成记录 {date: {taskId: {progress, points, time}}}
    // 每周每月任务的周期记录
    weeklyRecords: {},   // {weekKey: {taskId: {progress, points}}}
    monthlyRecords: {},  // {monthKey: {taskId: {progress, points}}}
    // 奖励
    rewards: [],         // {id, name, cost, icon}
    exchangeRecords: [], // {name, cost, icon, time}
    // 抽奖
    lotteryChances: 0,   // 剩余抽奖次数
    // 道具
    doubleCards: 0,      // 双倍积分卡数量
    shields: 0,          // 断签护盾数量
    doubleCardActive: null, // 双倍卡激活时间戳 (ms)，null=未激活
    // 徽章
    badges: [],          // {id, name, icon, unlockedAt, count}
    // 每日挑战
    dailyChallenge: null, // {date, type, desc, reward, done}
    // 每日积分历史（用于统计图表）
    pointsHistory: {},   // {date: earnedPoints}
    // 上次访问时间（用于判断断签）
    lastVisit: null,
    // 生日设置
    birthdayLunar: { month: 3, day: 28 } // 农历三月廿八
  };
}

var data = loadData();

function loadData() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return getDefaultData();
    var parsed = JSON.parse(raw);
    // 合并默认值，防止字段缺失
    var defaults = getDefaultData();
    return Object.assign(defaults, parsed);
  } catch(e) {
    return getDefaultData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch(e) {
    showToast('数据保存失败');
  }
}

/* ===== 日期工具 ===== */
function getTodayStr() {
  return formatDate(getCurrentDay());
}

function getCurrentDay() {
  // 每日凌晨5点刷新，5点前算前一天
  var now = new Date();
  var hour = now.getHours();
  if (hour < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now;
}

function formatDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function getWeekKey(d) {
  // 周一为一周开始
  var date = d || getCurrentDay();
  var day = date.getDay();
  var diff = day === 0 ? -6 : 1 - day; // 周一为0
  var monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return formatDate(monday);
}

function getMonthKey(d) {
  var date = d || getCurrentDay();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function dateDiffDays(d1, d2) {
  var t1 = new Date(d1).getTime();
  var t2 = new Date(d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/* ===== 法定节假日 ===== */
function getHolidays(year) {
  var holidays = {};
  // 元旦
  holidays[year + '-01-01'] = '元旦';
  // 清明（约4月4-6日）
  holidays[year + '-04-04'] = '清明节';
  holidays[year + '-04-05'] = '清明节';
  holidays[year + '-04-06'] = '清明节';
  // 劳动节
  holidays[year + '-05-01'] = '劳动节';
  holidays[year + '-05-02'] = '劳动节';
  holidays[year + '-05-03'] = '劳动节';
  // 端午（使用预计算表，回退用农历换算）
  var dbStr = (typeof DRAGON_BOAT !== 'undefined' && DRAGON_BOAT[year]) || formatDate(getSolarFromLunar(year, 5, 5));
  holidays[dbStr] = '端午节';
  // 中秋（使用预计算表，回退用农历换算）
  var maStr = (typeof MID_AUTUMN !== 'undefined' && MID_AUTUMN[year]) || formatDate(getSolarFromLunar(year, 8, 15));
  holidays[maStr] = '中秋节';
  // 国庆
  holidays[year + '-10-01'] = '国庆节';
  holidays[year + '-10-02'] = '国庆节';
  holidays[year + '-10-03'] = '国庆节';
  // 春节（使用预计算表，回退用农历换算）
  var sfStr = (typeof SPRING_FESTIVAL !== 'undefined' && SPRING_FESTIVAL[year]) || formatDate(getSolarFromLunar(year, 1, 1));
  var sfParts = sfStr.split('-');
  var sfDate = new Date(parseInt(sfParts[0]), parseInt(sfParts[1]) - 1, parseInt(sfParts[2]));
  for (var i = 0; i < 7; i++) {
    var d = new Date(sfDate);
    d.setDate(sfDate.getDate() + i);
    holidays[formatDate(d)] = '春节';
  }
  return holidays;
}

function getHolidayName(dateStr) {
  var parts = dateStr.split('-');
  var year = parseInt(parts[0]);
  var holidays = getHolidays(year);
  if (holidays[dateStr]) return holidays[dateStr];
  // 检查相邻年份（跨年情况）
  if (parts[1] === '01' || parts[1] === '12') {
    var altYear = parts[1] === '01' ? year - 1 : year + 1;
    var altHolidays = getHolidays(altYear);
    if (altHolidays[dateStr]) return altHolidays[dateStr];
  }
  return null;
}

/* ===== 生日换算 ===== */
function getBirthdayThisYear() {
  var year = new Date().getFullYear();
  // 农历三月廿八
  var birthday = getSolarFromLunar(year, 3, 28);
  return formatDate(birthday);
}

function isBirthday(dateStr) {
  return dateStr === getBirthdayThisYear();
}

/* ===== 倍率系统 ===== */
function getStreakMultiplier() {
  // 连续打卡第7天循环倍率
  if (data.streak < 7) return 1;
  // 检查今天是否是第7天的倍数
  if (data.streak % 7 === 0) {
    var weekNum = data.streak / 7;
    // 奇数周 ×1.2，偶数周 ×1.5
    return weekNum % 2 === 1 ? 1.2 : 1.5;
  }
  return 1;
}

function getSpecialDayMultiplier() {
  var today = getTodayStr();
  if (isBirthday(today)) return 3;
  if (getHolidayName(today)) return 3;
  return 1;
}

function getDoubleCardMultiplier() {
  if (data.doubleCardActive) {
    var elapsed = Date.now() - data.doubleCardActive;
    if (elapsed < 24 * 60 * 60 * 1000) {
      return 2;
    } else {
      // 过期了
      data.doubleCardActive = null;
      saveData();
    }
  }
  return 1;
}

function getTotalMultiplier() {
  // 所有倍率相乘
  return getStreakMultiplier() * getSpecialDayMultiplier() * getDoubleCardMultiplier();
}

function getActiveMultipliers() {
  var multipliers = [];
  var sm = getStreakMultiplier();
  if (sm > 1) {
    var weekNum = data.streak / 7;
    multipliers.push({
      name: '连续打卡第' + data.streak + '天',
      rate: sm,
      detail: '第' + weekNum + '周' + (weekNum % 2 === 1 ? '（×1.2）' : '（×1.5）')
    });
  }
  var sdm = getSpecialDayMultiplier();
  if (sdm > 1) {
    var today = getTodayStr();
    if (isBirthday(today)) {
      multipliers.push({ name: '生日快乐', rate: sdm, detail: '生日三倍' });
    } else {
      multipliers.push({ name: getHolidayName(today), rate: sdm, detail: '节日三倍' });
    }
  }
  var dcm = getDoubleCardMultiplier();
  if (dcm > 1) {
    multipliers.push({ name: '双倍积分卡', rate: dcm, detail: '24小时有效' });
  }
  return multipliers;
}

/* ===== 等级系统 ===== */
function getLevelInfo(level) {
  // 计算达到某等级所需的累计XP
  // 1-10级: 100/级
  // 10-20级: 200/级
  // 20-30级: 300/级 ...
  if (level <= 1) return 0;
  var total = 0;
  for (var i = 1; i < level; i++) {
    total += getXpForLevel(i);
  }
  return total;
}

function getXpForLevel(level) {
  // 从 level 升到 level+1 所需XP
  var tier = Math.floor((level - 1) / 10); // 0, 1, 2, ...
  return (tier + 1) * 100;
}

function getLevelFromXP(xp) {
  var level = 1;
  var remaining = xp;
  while (remaining >= getXpForLevel(level)) {
    remaining -= getXpForLevel(level);
    level++;
  }
  return { level: level, currentXp: remaining, needXp: getXpForLevel(level) };
}

function getLotteryChancesForLevel(level) {
  // 每级抽奖次数 = 十位 + 1
  var tier = Math.floor((level - 1) / 10);
  var base = tier + 1;
  // 整十级翻倍
  if (level % 10 === 0) base *= 2;
  return base;
}

function getShieldForLevel(level) {
  // 整十级获得护盾
  return level % 10 === 0;
}

/* ===== 连续打卡 ===== */
function checkStreak() {
  var today = getTodayStr();
  if (data.lastCheckIn === today) return; // 今天已经打卡过

  if (data.lastCheckIn) {
    var diff = dateDiffDays(data.lastCheckIn, today);
    if (diff > 1) {
      // 断签了
      if (data.shields > 0) {
        // 使用护盾
        data.shields--;
        showToast('🛡️ 已自动使用护盾，保护连续记录！');
      } else {
        // 连续记录清零
        data.streak = 0;
      }
      saveData();
    }
  }
}

function onCheckIn() {
  var today = getTodayStr();
  if (data.lastCheckIn !== today) {
    data.streak++;
    data.lastCheckIn = today;
    // 检查7天循环奖励
    if (data.streak % 7 === 0) {
      // 额外+10积分
      data.availablePoints += 10;
      data.totalXP += 10;
      saveData();
      showToast('🔥 连续打卡' + data.streak + '天！额外+10积分');
    }
    // 检查里程碑奖励
    checkStreakMilestones();
    saveData();
  }
}

function checkStreakMilestones() {
  // 每30天: +50积分 + 双倍卡 + 徽章
  if (data.streak > 0 && data.streak % 30 === 0) {
    data.availablePoints += 50;
    data.totalXP += 50;
    data.doubleCards++;
    unlockBadge('streak_' + data.streak, '连续打卡' + data.streak + '天', '🔥');
    showToast('🏆 连续打卡' + data.streak + '天！+50积分 + 双倍卡 + 徽章');
  }
  // 每100天: +100积分
  if (data.streak > 0 && data.streak % 100 === 0) {
    data.availablePoints += 100;
    data.totalXP += 100;
    showToast('🎉 连续打卡' + data.streak + '天！额外+100积分');
  }
  // 每365天: +365积分 + 徽章
  if (data.streak > 0 && data.streak % 365 === 0) {
    data.availablePoints += 365;
    data.totalXP += 365;
    unlockBadge('streak_' + data.streak, '连续打卡' + data.streak + '天', '🌟');
    showToast('🎉🎉 连续打卡' + data.streak + '天！+365积分 + 专属徽章');
  }
}

/* ===== 徽章系统 ===== */
var BADGE_DEFS = [
  { id: 'first_task', name: '初次完成', icon: '🌱', desc: '完成第一个任务' },
  { id: 'streak_7', name: '一周坚持', icon: '🔥', desc: '连续打卡7天' },
  { id: 'streak_14', name: '两周坚持', icon: '🔥', desc: '连续打卡14天' },
  { id: 'streak_21', name: '三周坚持', icon: '🔥', desc: '连续打卡21天' },
  { id: 'streak_30', name: '月度坚持', icon: '🏆', desc: '连续打卡30天' },
  { id: 'streak_60', name: '双月坚持', icon: '🏆', desc: '连续打卡60天' },
  { id: 'streak_90', name: '季度坚持', icon: '🏆', desc: '连续打卡90天' },
  { id: 'streak_100', name: '百日坚持', icon: '💯', desc: '连续打卡100天' },
  { id: 'streak_180', name: '半载坚持', icon: '💎', desc: '连续打卡180天' },
  { id: 'streak_365', name: '年度坚持', icon: '🌟', desc: '连续打卡365天' },
  { id: 'first_reward', name: '首次兑换', icon: '🎁', desc: '兑换第一个奖励' },
  { id: 'first_lottery', name: '初次抽奖', icon: '🎰', desc: '首次使用积分抽奖' },
  { id: 'points_500', name: '积分小成', icon: '🪙', desc: '累计获得500积分' },
  { id: 'points_1000', name: '积分中成', icon: '🪙', desc: '累计获得1000积分' },
  { id: 'points_5000', name: '积分大成', icon: '💎', desc: '累计获得5000积分' },
  { id: 'level_10', name: '十级达成', icon: '⭐', desc: '达到10级' },
  { id: 'level_20', name: '二十级达成', icon: '⭐', desc: '达到20级' },
  { id: 'level_30', name: '三十级达成', icon: '👑', desc: '达到30级' }
];

function unlockBadge(id, name, icon) {
  var existing = data.badges.find(function(b) { return b.id === id; });
  if (existing) {
    existing.count++;
    existing.unlockedAt = getTodayStr();
  } else {
    // 尝试从预定义中找
    var def = BADGE_DEFS.find(function(b) { return b.id === id; });
    data.badges.push({
      id: id,
      name: name || (def ? def.name : id),
      icon: icon || (def ? def.icon : '🏅'),
      unlockedAt: getTodayStr(),
      count: 1
    });
  }
  saveData();
  // 显示解锁弹窗
  var b = data.badges.find(function(b) { return b.id === id; });
  showBadgeUnlock(b.icon, b.name);
}

function checkAutoBadges() {
  // 首次完成任务
  if (data.totalXP > 0 && !data.badges.find(function(b) { return b.id === 'first_task'; })) {
    unlockBadge('first_task', '初次完成', '🌱');
  }
  // 连续打卡里程碑
  var streakBadges = [
    { days: 7, id: 'streak_7', name: '一周坚持', icon: '🔥' },
    { days: 14, id: 'streak_14', name: '两周坚持', icon: '🔥' },
    { days: 21, id: 'streak_21', name: '三周坚持', icon: '🔥' },
    { days: 30, id: 'streak_30', name: '月度坚持', icon: '🏆' },
    { days: 60, id: 'streak_60', name: '双月坚持', icon: '🏆' },
    { days: 90, id: 'streak_90', name: '季度坚持', icon: '🏆' },
    { days: 100, id: 'streak_100', name: '百日坚持', icon: '💯' },
    { days: 180, id: 'streak_180', name: '半载坚持', icon: '💎' },
    { days: 365, id: 'streak_365', name: '年度坚持', icon: '🌟' }
  ];
  for (var i = 0; i < streakBadges.length; i++) {
    var sb = streakBadges[i];
    if (data.streak >= sb.days && !data.badges.find(function(b) { return b.id === sb.id; })) {
      unlockBadge(sb.id, sb.name, sb.icon);
    }
  }
  // 积分里程碑
  var pointBadges = [
    { pts: 500, id: 'points_500', name: '积分小成', icon: '🪙' },
    { pts: 1000, id: 'points_1000', name: '积分中成', icon: '🪙' },
    { pts: 5000, id: 'points_5000', name: '积分大成', icon: '💎' }
  ];
  for (var j = 0; j < pointBadges.length; j++) {
    var pb = pointBadges[j];
    if (data.totalXP >= pb.pts && !data.badges.find(function(b) { return b.id === pb.id; })) {
      unlockBadge(pb.id, pb.name, pb.icon);
    }
  }
  // 等级徽章
  var levelBadges = [
    { lv: 10, id: 'level_10', name: '十级达成', icon: '⭐' },
    { lv: 20, id: 'level_20', name: '二十级达成', icon: '⭐' },
    { lv: 30, id: 'level_30', name: '三十级达成', icon: '👑' }
  ];
  for (var k = 0; k < levelBadges.length; k++) {
    var lb = levelBadges[k];
    var levelInfo = getLevelFromXP(data.totalXP);
    if (levelInfo.level >= lb.lv && !data.badges.find(function(b) { return b.id === lb.id; })) {
      unlockBadge(lb.id, lb.name, lb.icon);
    }
  }
}

/* ===== 每日挑战 ===== */
var CHALLENGE_TYPES = [
  { type: 'complete_3', desc: '今天完成3个任务', reward: 10 },
  { type: 'complete_5', desc: '今天完成5个任务', reward: 15 },
  { type: 'fitness', desc: '完成一个健身类任务', reward: 8 },
  { type: 'study', desc: '完成一个学习类任务', reward: 8 },
  { type: 'work', desc: '完成一个工作类任务', reward: 8 },
  { type: 'clear_all', desc: '清空今日所有任务', reward: 15 },
  { type: 'monthly', desc: '完成一个每月任务', reward: 12 },
  { type: 'points_20', desc: '今天获得20积分', reward: 10 },
  { type: 'points_30', desc: '今天获得30积分', reward: 12 }
];

function generateDailyChallenge() {
  var today = getTodayStr();
  if (data.dailyChallenge && data.dailyChallenge.date === today) return;

  var idx = Math.floor(Math.random() * CHALLENGE_TYPES.length);
  var challenge = CHALLENGE_TYPES[idx];
  data.dailyChallenge = {
    date: today,
    type: challenge.type,
    desc: challenge.desc,
    reward: challenge.reward,
    done: false
  };
  saveData();
}

function checkDailyChallenge() {
  if (!data.dailyChallenge || data.dailyChallenge.done) return;
  var today = getTodayStr();
  if (data.dailyChallenge.date !== today) return;

  var todayRecords = data.taskRecords[today] || {};
  var completedTasks = Object.keys(todayRecords).filter(function(tid) {
    return todayRecords[tid].progress > 0;
  });
  var challenge = data.dailyChallenge;

  switch(challenge.type) {
    case 'complete_3':
      if (completedTasks.length >= 3) completeDailyChallenge();
      break;
    case 'complete_5':
      if (completedTasks.length >= 5) completeDailyChallenge();
      break;
    case 'fitness':
      if (completedTasks.some(function(tid) {
        var task = data.tasks.find(function(t) { return t.id === tid; });
        return task && task.tag === '健身';
      })) completeDailyChallenge();
      break;
    case 'study':
      if (completedTasks.some(function(tid) {
        var task = data.tasks.find(function(t) { return t.id === tid; });
        return task && task.tag === '学习';
      })) completeDailyChallenge();
      break;
    case 'work':
      if (completedTasks.some(function(tid) {
        var task = data.tasks.find(function(t) { return t.id === tid; });
        return task && task.tag === '工作';
      })) completeDailyChallenge();
      break;
    case 'clear_all':
      var dailyTasks = data.tasks.filter(function(t) { return t.period === 'daily'; });
      if (dailyTasks.length > 0 && dailyTasks.every(function(t) {
        return todayRecords[t.id] && todayRecords[t.id].progress > 0;
      })) completeDailyChallenge();
      break;
    case 'monthly':
      var monthKey = getMonthKey();
      var monthlyRecs = data.monthlyRecords[monthKey] || {};
      if (Object.keys(monthlyRecs).some(function(tid) {
        return monthlyRecs[tid].progress > 0;
      })) completeDailyChallenge();
      break;
    case 'points_20':
      var earnedToday = data.pointsHistory[today] || 0;
      if (earnedToday >= 20) completeDailyChallenge();
      break;
    case 'points_30':
      var earnedToday2 = data.pointsHistory[today] || 0;
      if (earnedToday2 >= 30) completeDailyChallenge();
      break;
  }
}

function completeDailyChallenge() {
  if (!data.dailyChallenge || data.dailyChallenge.done) return;
  data.dailyChallenge.done = true;
  var reward = data.dailyChallenge.reward;
  var multiplier = getTotalMultiplier();
  var actualReward = Math.round(reward * multiplier);
  data.availablePoints += actualReward;
  data.totalXP += actualReward;
  // 记录今日积分
  var today = getTodayStr();
  data.pointsHistory[today] = (data.pointsHistory[today] || 0) + actualReward;
  saveData();
  showToast('🎯 挑战完成！+' + actualReward + '积分');
  checkLevelUp();
  checkAutoBadges();
}

/* ===== 积分计算 ===== */
function awardPoints(basePoints, taskId) {
  var multiplier = getTotalMultiplier();
  var actualPoints = Math.round(basePoints * multiplier);
  data.availablePoints += actualPoints;
  data.totalXP += actualPoints;
  // 记录今日积分
  var today = getTodayStr();
  data.pointsHistory[today] = (data.pointsHistory[today] || 0) + actualPoints;
  saveData();

  // 飘字动画
  showFloatPoints('+' + actualPoints);

  // 积分数字跳动
  var pointsEl = document.getElementById('points-num');
  if (pointsEl) {
    pointsEl.classList.remove('bump');
    void pointsEl.offsetWidth;
    pointsEl.classList.add('bump');
  }

  // 检查每日挑战
  checkDailyChallenge();

  // 检查升级和徽章
  checkLevelUp();
  checkAutoBadges();

  return actualPoints;
}

/* ===== 等级升级检查 ===== */
function checkLevelUp() {
  var oldLevel = data.level;
  var levelInfo = getLevelFromXP(data.totalXP);
  if (levelInfo.level > oldLevel) {
    // 可能连升多级
    for (var lv = oldLevel + 1; lv <= levelInfo.level; lv++) {
      data.level = lv;
      // 发放升级奖励
      var chances = getLotteryChancesForLevel(lv);
      data.lotteryChances += chances;
      var shield = getShieldForLevel(lv);
      if (shield) data.shields++;

      // 显示升级弹窗
      var rewardText = '获得 ' + chances + ' 次抽奖机会';
      if (shield) rewardText += ' + 断签护盾×1';
      showLevelUp(lv, rewardText);
    }
    saveData();
    checkAutoBadges();
  }
}

/* ===== 任务完成 ===== */
function completeTask(taskId, progress) {
  var task = data.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  var today = getTodayStr();
  var recordKey, records;

  if (task.period === 'daily') {
    recordKey = today;
    records = data.taskRecords[today] || {};
  } else if (task.period === 'weekly') {
    recordKey = getWeekKey();
    records = data.weeklyRecords[recordKey] || {};
  } else {
    recordKey = getMonthKey();
    records = data.monthlyRecords[recordKey] || {};
  }

  var existing = records[taskId];
  var oldProgress = existing ? existing.progress : 0;
  var newProgress = progress;

  // 如果进度增加
  if (newProgress > oldProgress) {
    var progressDiff = newProgress - oldProgress;
    var basePoints = task.points * progressDiff / 100;
    var actualPoints = awardPoints(basePoints, taskId);

    records[taskId] = {
      progress: newProgress,
      points: (existing ? existing.points : 0) + actualPoints,
      time: Date.now()
    };

    if (task.period === 'daily') {
      data.taskRecords[today] = records;
      // 打卡
      onCheckIn();
    } else if (task.period === 'weekly') {
      data.weeklyRecords[recordKey] = records;
    } else {
      data.monthlyRecords[recordKey] = records;
    }

    saveData();
  } else if (newProgress < oldProgress) {
    // 进度减少（不扣分）
    records[taskId] = {
      progress: newProgress,
      points: existing ? existing.points : 0,
      time: Date.now()
    };
    if (task.period === 'daily') data.taskRecords[today] = records;
    else if (task.period === 'weekly') data.weeklyRecords[recordKey] = records;
    else data.monthlyRecords[recordKey] = records;
    saveData();
  }

  // 检查特殊日期额外奖励
  var holidayToday = getTodayStr();
  if (isBirthday(holidayToday) || getHolidayName(holidayToday)) {
    // 检查是否全部清空
    var dailyTasks = data.tasks.filter(function(t) { return t.period === 'daily'; });
    var todayRecs = data.taskRecords[holidayToday] || {};
    if (dailyTasks.length > 0 && dailyTasks.every(function(t) {
      return todayRecs[t.id] && todayRecs[t.id].progress >= 100;
    })) {
      // 全部完成，给2次抽奖
      data.lotteryChances += 2;
      saveData();
      showToast('🎉 节日全清任务！+2次抽奖机会');
    }
    if (isBirthday(holidayToday)) {
      // 生日额外3次抽奖（每天只给一次）
      if (!data._birthdayLotteryGiven || data._birthdayLotteryGiven !== holidayToday) {
        data.lotteryChances += 3;
        data._birthdayLotteryGiven = holidayToday;
        saveData();
        showToast('🎂 生日快乐！+3次抽奖机会');
      }
    }
  }
}

/* ===== 抽奖系统 ===== */
function doLottery() {
  if (data.lotteryChances <= 0) {
    showToast('没有抽奖机会了');
    return;
  }
  data.lotteryChances--;
  // 随机 10~100 积分
  var points = Math.floor(Math.random() * 91) + 10;
  data.availablePoints += points;
  data.totalXP += points;
  var today = getTodayStr();
  data.pointsHistory[today] = (data.pointsHistory[today] || 0) + points;
  saveData();

  // 首次抽奖徽章
  if (!data.badges.find(function(b) { return b.id === 'first_lottery'; })) {
    unlockBadge('first_lottery', '初次抽奖', '🎰');
  }

  checkLevelUp();
  checkAutoBadges();
  return points;
}

/* ===== 奖励兑换 ===== */
function exchangeReward(rewardId) {
  var reward = data.rewards.find(function(r) { return r.id === rewardId; });
  if (!reward) return;
  if (data.availablePoints < reward.cost) {
    showToast('积分不足');
    return;
  }
  data.availablePoints -= reward.cost;
  data.exchangeRecords.unshift({
    name: reward.name,
    cost: reward.cost,
    icon: reward.icon,
    time: getTodayStr() + ' ' + new Date().toTimeString().slice(0, 5)
  });
  // 只保留最近20条
  if (data.exchangeRecords.length > 20) data.exchangeRecords.length = 20;
  saveData();

  // 首次兑换徽章
  if (!data.badges.find(function(b) { return b.id === 'first_reward'; })) {
    unlockBadge('first_reward', '首次兑换', '🎁');
  }
  showToast('🎉 兑换成功：' + reward.name);
}

/* ===== UI 渲染 ===== */
var currentPeriod = 'daily';
var editingTaskId = null;
var editingRewardId = null;
var selectedTag = '学习';
var selectedIcon = '🧋';

function render() {
  renderLevelBar();
  renderSpecialBanner();
  renderDailyChallenge();
  renderTaskList();
  renderRewardsPage();
  renderStatsPage();
}

function renderLevelBar() {
  var levelInfo = getLevelFromXP(data.totalXP);
  var xpPercent = (levelInfo.currentXp / levelInfo.needXp) * 100;

  document.getElementById('level-num').textContent = 'Lv.' + data.level;
  document.getElementById('points-num').textContent = data.availablePoints;
  document.getElementById('xp-bar-fill').style.width = xpPercent + '%';
  document.getElementById('xp-text').textContent = levelInfo.currentXp + ' / ' + levelInfo.needXp + ' XP';
  document.getElementById('streak-text').textContent = '连续打卡 ' + data.streak + ' 天';

  // 奖励页也更新
  document.getElementById('rewards-level').textContent = 'Lv.' + data.level;
  document.getElementById('rewards-points').textContent = data.availablePoints;
}

function renderSpecialBanner() {
  var banner = document.getElementById('special-banner');
  var today = getTodayStr();
  var multipliers = getActiveMultipliers();

  if (multipliers.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  var totalMult = getTotalMultiplier();
  var parts = multipliers.map(function(m) { return m.name + ' ×' + m.rate; });
  banner.textContent = '✨ 今日倍率 ' + parts.join(' + ') + ' = ×' + totalMult.toFixed(1);
  banner.classList.remove('hidden');
}

function renderDailyChallenge() {
  generateDailyChallenge();
  var ch = data.dailyChallenge;
  if (!ch) return;

  var el = document.getElementById('daily-challenge');
  document.getElementById('challenge-desc').textContent = ch.desc;
  document.getElementById('challenge-reward').textContent = '+' + ch.reward + '分';

  if (ch.done) {
    el.classList.add('done');
  } else {
    el.classList.remove('done');
  }
}

function renderTaskList() {
  var period = currentPeriod;
  var tasks = data.tasks.filter(function(t) { return t.period === period; });

  var titleMap = { daily: '今日任务', weekly: '本周任务', monthly: '本月任务' };
  var iconMap = { daily: '📋', weekly: '📅', monthly: '🗓️' };
  document.getElementById('task-list-icon').textContent = iconMap[period];
  document.getElementById('task-list-title').textContent = titleMap[period];

  // 获取完成记录
  var records;
  if (period === 'daily') {
    records = data.taskRecords[getTodayStr()] || {};
  } else if (period === 'weekly') {
    records = data.weeklyRecords[getWeekKey()] || {};
  } else {
    records = data.monthlyRecords[getMonthKey()] || {};
  }

  // 完成率
  var total = tasks.length;
  var completed = tasks.filter(function(t) {
    return records[t.id] && records[t.id].progress >= 100;
  }).length;
  var rateEl = document.getElementById('completion-rate');
  if (total === 0) {
    rateEl.innerHTML = '<span class="rate-num">0</span> / 0 完成';
  } else {
    rateEl.innerHTML = '<span class="rate-num">' + completed + '</span> / ' + total + ' 完成';
  }

  // 渲染任务列表
  var listEl = document.getElementById('task-list');
  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-text">还没有任务，点击下方添加吧</div></div>';
    return;
  }

  var html = tasks.map(function(task) {
    var rec = records[task.id];
    var progress = rec ? rec.progress : 0;
    var isCompleted = progress >= 100;
    var isPartial = progress > 0 && progress < 100;

    var cls = 'task-item';
    if (isCompleted) cls += ' completed';
    if (isPartial) cls += ' partial';

    var checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    var pointsText = task.points + '分';
    if (isPartial) {
      pointsText = '+' + Math.round(rec.points) + '/' + task.points + '分';
    } else if (isCompleted) {
      pointsText = '+' + Math.round(rec.points) + '分';
    }

    var progressBar = '';
    if (isPartial) {
      progressBar = '<div class="task-progress-bar" style="width: ' + progress + '%"></div>';
    }

    return '<div class="' + cls + '" data-task-id="' + task.id + '">' +
      '<div class="task-check">' + checkSvg + '</div>' +
      '<div class="task-content">' +
        '<div class="task-name">' + escapeHtml(task.name) + '</div>' +
        '<div class="task-meta">' +
          '<span class="task-tag">' + escapeHtml(task.tag) + '</span>' +
          '<span class="task-points ' + (progress > 0 ? 'earned' : '') + '">' + pointsText + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="task-actions">' +
        '<button class="task-action-btn edit" data-action="edit" data-task-id="' + task.id + '">✎</button>' +
        '<button class="task-action-btn delete" data-action="delete" data-task-id="' + task.id + '">✕</button>' +
      '</div>' +
      progressBar +
    '</div>';
  }).join('');

  listEl.innerHTML = html;
}

function renderRewardsPage() {
  // 奖励列表
  var listEl = document.getElementById('reward-list');
  if (data.rewards.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><div class="empty-text">还没有奖励，添加一个吧</div></div>';
  } else {
    listEl.innerHTML = data.rewards.map(function(r) {
      var canAfford = data.availablePoints >= r.cost;
      return '<div class="reward-item" data-reward-id="' + r.id + '">' +
        '<div class="reward-icon">' + r.icon + '</div>' +
        '<div class="reward-content">' +
          '<div class="reward-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="reward-cost">' + r.cost + ' 积分</div>' +
        '</div>' +
        '<div class="reward-actions">' +
          '<button class="btn btn-sm ' + (canAfford ? 'btn-primary' : 'btn-secondary') + ' exchange-btn" data-reward-id="' + r.id + '" ' + (canAfford ? '' : 'disabled') + '>兑换</button>' +
          '<button class="btn btn-sm btn-ghost edit-reward-btn" data-reward-id="' + r.id + '">✎</button>' +
          '<button class="btn btn-sm btn-danger delete-reward-btn" data-reward-id="' + r.id + '">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // 抽奖
  document.getElementById('lottery-count').textContent = '剩余抽奖机会：' + data.lotteryChances + ' 次';
  var lotteryBtn = document.getElementById('lottery-btn');
  lotteryBtn.disabled = data.lotteryChances <= 0;

  // 道具栏
  var invEl = document.getElementById('inventory-grid');
  var doubleCardActive = data.doubleCardActive && (Date.now() - data.doubleCardActive < 24 * 60 * 60 * 1000);
  var invHtml = '';

  // 双倍卡
  invHtml += '<div class="inventory-item ' + (data.doubleCards === 0 && !doubleCardActive ? 'disabled' : '') + '">' +
    '<div class="inv-icon">⚡</div>' +
    '<div class="inv-name">双倍积分卡</div>' +
    '<div class="inv-count">' + (doubleCardActive ? '使用中' : '×' + data.doubleCards) + '</div>';
  if (data.doubleCards > 0 && !doubleCardActive) {
    invHtml += '<button class="inv-use-btn use-double-card-btn">使用</button>';
  }
  invHtml += '</div>';

  // 护盾
  invHtml += '<div class="inventory-item ' + (data.shields === 0 ? 'disabled' : '') + '">' +
    '<div class="inv-icon">🛡️</div>' +
    '<div class="inv-name">断签护盾</div>' +
    '<div class="inv-count">×' + data.shields + '</div>' +
    '<div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">自动生效</div>' +
  '</div>';

  invEl.innerHTML = invHtml;

  // 兑换记录
  var exEl = document.getElementById('exchange-list');
  if (data.exchangeRecords.length === 0) {
    exEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-text">暂无兑换记录</div></div>';
  } else {
    exEl.innerHTML = data.exchangeRecords.map(function(r) {
      return '<div class="exchange-record">' +
        '<span>' + r.icon + ' ' + escapeHtml(r.name) + ' <span style="color:var(--text-tertiary);font-size:11px;">' + r.time + '</span></span>' +
        '<span class="ex-cost">-' + r.cost + '</span>' +
      '</div>';
    }).join('');
  }
}

function renderStatsPage() {
  // 完成率
  var dailyTasks = data.tasks.filter(function(t) { return t.period === 'daily'; });
  var weeklyTasks = data.tasks.filter(function(t) { return t.period === 'weekly'; });
  var monthlyTasks = data.tasks.filter(function(t) { return t.period === 'monthly'; });

  var todayRecs = data.taskRecords[getTodayStr()] || {};
  var weekRecs = data.weeklyRecords[getWeekKey()] || {};
  var monthRecs = data.monthlyRecords[getMonthKey()] || {};

  function calcRate(tasks, recs) {
    if (tasks.length === 0) return 0;
    var done = tasks.filter(function(t) { return recs[t.id] && recs[t.id].progress >= 100; }).length;
    return Math.round((done / tasks.length) * 100);
  }

  document.getElementById('stat-daily-rate').textContent = calcRate(dailyTasks, todayRecs) + '%';
  document.getElementById('stat-weekly-rate').textContent = calcRate(weeklyTasks, weekRecs) + '%';
  document.getElementById('stat-monthly-rate').textContent = calcRate(monthlyTasks, monthRecs) + '%';

  // 积分趋势图
  renderPointsChart();

  // 分类分布
  renderCategoryChart();

  // 徽章墙
  renderBadgeGrid();
}

function renderPointsChart() {
  var canvas = document.getElementById('chart-points');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // 获取近7天数据
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    days.push(formatDate(d));
  }

  var values = days.map(function(d) { return data.pointsHistory[d] || 0; });
  var maxVal = Math.max.apply(null, values.concat([10]));

  // 画图
  var w = canvas.offsetWidth;
  var h = 160;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);

  ctx.clearRect(0, 0, w, h);

  // 网格线
  ctx.strokeStyle = '#eaf5ed';
  ctx.lineWidth = 1;
  for (var g = 0; g < 4; g++) {
    var y = (h - 30) * (g / 3) + 10;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
  }

  // 折线
  var padding = 30;
  var chartW = w - padding - 10;
  var chartH = h - 40;

  ctx.strokeStyle = '#2d5a3d';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  values.forEach(function(v, i) {
    var x = padding + (chartW / 6) * i;
    var y = chartH - (v / maxVal) * (chartH - 20) + 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 填充
  ctx.lineTo(padding + chartW, chartH + 10);
  ctx.lineTo(padding, chartH + 10);
  ctx.closePath();
  ctx.fillStyle = 'rgba(45, 90, 61, 0.08)';
  ctx.fill();

  // 数据点
  values.forEach(function(v, i) {
    var x = padding + (chartW / 6) * i;
    var y = chartH - (v / maxVal) * (chartH - 20) + 10;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2d5a3d';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // 日期标签
  ctx.fillStyle = '#8a9a90';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  days.forEach(function(d, i) {
    var x = padding + (chartW / 6) * i;
    var label = d.slice(5);
    ctx.fillText(label, x, h - 5);
  });
}

function renderCategoryChart() {
  var canvas = document.getElementById('chart-categories');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // 统计各分类的已完成积分数
  var catPoints = {};
  var today = getTodayStr();
  var todayRecs = data.taskRecords[today] || {};

  data.tasks.forEach(function(t) {
    var rec = todayRecs[t.id];
    if (rec && rec.points > 0) {
      catPoints[t.tag] = (catPoints[t.tag] || 0) + rec.points;
    }
  });

  var cats = Object.keys(catPoints);
  var values = cats.map(function(c) { return catPoints[c]; });
  var total = values.reduce(function(a, b) { return a + b; }, 0);

  var w = canvas.offsetWidth;
  var h = 160;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);
  ctx.clearRect(0, 0, w, h);

  if (total === 0) {
    ctx.fillStyle = '#8a9a90';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w / 2, h / 2);
    document.getElementById('category-legend').innerHTML = '';
    return;
  }

  // 画饼图
  var cx = w / 2;
  var cy = h / 2;
  var radius = Math.min(w, h) / 2 - 20;
  var startAngle = -Math.PI / 2;

  var colors = ['#2d5a3d', '#52b788', '#e9b44c', '#4a8eb5', '#e07a5f', '#b7e4c7'];

  cats.forEach(function(cat, i) {
    var angle = (values[i] / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    startAngle += angle;
  });

  // 中心空白
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 中心文字
  ctx.fillStyle = '#2d5a3d';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('今日', cx, cy - 6);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#8a9a90';
  ctx.fillText('分类分布', cx, cy + 10);

  // 图例
  var legendHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">' +
    cats.map(function(cat, i) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);">' +
        '<span style="width:10px;height:10px;border-radius:3px;background:' + colors[i % colors.length] + ';"></span>' +
        escapeHtml(cat) + ' ' + Math.round((values[i] / total) * 100) + '%' +
      '</span>';
    }).join('') +
    '</div>';
  document.getElementById('category-legend').innerHTML = legendHtml;
}

function renderBadgeGrid() {
  var gridEl = document.getElementById('badge-grid');

  // 合并预定义和已解锁
  var allBadges = BADGE_DEFS.map(function(def) {
    var unlocked = data.badges.find(function(b) { return b.id === def.id; });
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      desc: def.desc,
      unlocked: !!unlocked,
      count: unlocked ? unlocked.count : 0
    };
  });

  // 加上自定义解锁的徽章（如连续打卡30天的累加徽章）
  data.badges.forEach(function(b) {
    if (!allBadges.find(function(ab) { return ab.id === b.id; })) {
      allBadges.push({
        id: b.id,
        name: b.name,
        icon: b.icon,
        desc: '',
        unlocked: true,
        count: b.count
      });
    }
  });

  if (allBadges.length === 0) {
    gridEl.innerHTML = '<div class="empty-state"><div class="empty-text">暂无徽章</div></div>';
    return;
  }

  gridEl.innerHTML = allBadges.map(function(b) {
    var cls = 'badge-item ' + (b.unlocked ? 'unlocked' : 'locked');
    var countBadge = b.count > 1 ? '<div class="badge-count">×' + b.count + '</div>' : '';
    return '<div class="' + cls + '">' +
      '<div class="badge-icon">' + b.icon + '</div>' +
      '<div class="badge-name">' + escapeHtml(b.name) + '</div>' +
      countBadge +
    '</div>';
  }).join('');
}

/* ===== UI 辅助函数 ===== */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2200);
}

function showFloatPoints(text) {
  var el = document.createElement('div');
  el.className = 'float-points';
  el.textContent = text;
  el.style.left = (window.innerWidth / 2 - 30) + 'px';
  el.style.top = '120px';
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 1200);
}

function showLevelUp(level, rewardText) {
  var overlay = document.getElementById('levelup-overlay');
  document.getElementById('levelup-title').textContent = 'Lv.' + level;
  document.getElementById('levelup-subtitle').textContent = level % 10 === 0 ? '里程碑达成！' : '恭喜升级！';
  document.getElementById('levelup-reward').innerHTML = '<div class="levelup-reward-text">' + rewardText + '</div>';
  overlay.classList.add('show');
}

function showBadgeUnlock(icon, name) {
  var overlay = document.getElementById('badge-unlock-overlay');
  document.getElementById('badge-unlock-icon').textContent = icon;
  document.getElementById('badge-unlock-name').textContent = name;
  // 延迟显示，避免和升级弹窗冲突
  setTimeout(function() {
    overlay.classList.add('show');
  }, 100);
}

function showConfirm(text, onConfirm) {
  var overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-text').textContent = text;
  overlay.classList.add('show');

  var yesBtn = document.getElementById('confirm-yes-btn');
  var noBtn = document.getElementById('confirm-no-btn');

  var yesHandler = function() {
    overlay.classList.remove('show');
    yesBtn.removeEventListener('click', yesHandler);
    noBtn.removeEventListener('click', noHandler);
    onConfirm();
  };
  var noHandler = function() {
    overlay.classList.remove('show');
    yesBtn.removeEventListener('click', yesHandler);
    noBtn.removeEventListener('click', noHandler);
  };

  yesBtn.addEventListener('click', yesHandler);
  noBtn.addEventListener('click', noHandler);
}

/* ===== 事件绑定 ===== */
function bindEvents() {
  // 底部导航
  document.querySelectorAll('.nav-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var page = this.dataset.page;
      switchPage(page);
    });
  });

  // Tab 切换
  document.querySelectorAll('.tab-switch button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-switch button').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      currentPeriod = this.dataset.period;
      renderTaskList();
    });
  });

  // 添加任务
  document.getElementById('add-task-btn').addEventListener('click', function() {
    editingTaskId = null;
    selectedTag = '学习';
    document.getElementById('task-modal-title').textContent = '添加任务';
    document.getElementById('task-name-input').value = '';
    document.getElementById('task-points-input').value = '';
    document.getElementById('task-period-select').value = currentPeriod;
    document.querySelectorAll('#tag-options .tag-option').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('#tag-options .tag-option[data-tag="学习"]').classList.add('active');
    showModal('task-modal');
  });

  // 标签选择
  document.querySelectorAll('#tag-options .tag-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#tag-options .tag-option').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      selectedTag = this.dataset.tag;
    });
  });

  // 保存任务
  document.getElementById('task-save-btn').addEventListener('click', function() {
    var name = document.getElementById('task-name-input').value.trim();
    var points = parseInt(document.getElementById('task-points-input').value);
    var period = document.getElementById('task-period-select').value;

    if (!name) { showToast('请输入任务名称'); return; }
    if (!points || points < 1) { showToast('请输入有效积分值'); return; }

    if (editingTaskId) {
      var task = data.tasks.find(function(t) { return t.id === editingTaskId; });
      if (task) {
        task.name = name;
        task.points = points;
        task.period = period;
        task.tag = selectedTag;
      }
    } else {
      var newTask = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: name,
        points: points,
        period: period,
        tag: selectedTag,
        createdAt: Date.now()
      };
      data.tasks.push(newTask);
    }
    saveData();
    hideModal('task-modal');
    render();
  });

  // 取消任务
  document.getElementById('task-cancel-btn').addEventListener('click', function() {
    hideModal('task-modal');
  });

  // 任务列表点击（完成/进度选择）
  document.getElementById('task-list').addEventListener('click', function(e) {
    // 检查是否点击了编辑/删除按钮
    var actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      var action = actionBtn.dataset.action;
      var taskId = actionBtn.dataset.taskId;
      if (action === 'edit') {
        editTask(taskId);
      } else if (action === 'delete') {
        deleteTask(taskId);
      }
      return;
    }

    var taskItem = e.target.closest('.task-item');
    if (!taskItem) return;
    var taskId = taskItem.dataset.taskId;
    var task = data.tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;

    // 获取当前进度
    var records;
    if (task.period === 'daily') records = data.taskRecords[getTodayStr()] || {};
    else if (task.period === 'weekly') records = data.weeklyRecords[getWeekKey()] || {};
    else records = data.monthlyRecords[getMonthKey()] || {};

    var currentProgress = records[taskId] ? records[taskId].progress : 0;

    if (currentProgress >= 100) return; // 已完成

    // 显示进度选择弹窗
    document.getElementById('progress-task-name').textContent = task.name + ' (' + task.points + '分)';
    document.querySelectorAll('.progress-option').forEach(function(b) { b.classList.remove('active'); });
    updateProgressPreview(task.points, 0);
    document.getElementById('progress-modal').dataset.taskId = taskId;
    showModal('progress-modal');
  });

  // 进度选择
  document.querySelectorAll('.progress-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.progress-option').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      var progress = parseInt(this.dataset.progress);
      var modal = document.getElementById('progress-modal');
      var taskId = modal.dataset.taskId;
      var task = data.tasks.find(function(t) { return t.id === taskId; });
      if (task) {
        updateProgressPreview(task.points, progress);
      }
    });
  });

  // 进度确认 - 点击弹窗外区域或取消
  document.getElementById('progress-cancel-btn').addEventListener('click', function() {
    hideModal('progress-modal');
  });

  // 双击进度选项直接确认
  document.querySelectorAll('.progress-option').forEach(function(btn) {
    btn.addEventListener('dblclick', function() {
      confirmProgress();
    });
  });

  // 添加进度确认按钮
  var progressConfirmBtn = document.createElement('button');
  progressConfirmBtn.className = 'btn btn-primary btn-block';
  progressConfirmBtn.style.marginTop = '12px';
  progressConfirmBtn.textContent = '确认';
  progressConfirmBtn.addEventListener('click', confirmProgress);
  document.querySelector('#progress-modal .modal').insertBefore(
    progressConfirmBtn,
    document.getElementById('progress-cancel-btn')
  );

  function confirmProgress() {
    var modal = document.getElementById('progress-modal');
    var taskId = modal.dataset.taskId;
    var activeBtn = document.querySelector('.progress-option.active');
    if (!activeBtn) { showToast('请选择完成进度'); return; }
    var progress = parseInt(activeBtn.dataset.progress);
    completeTask(taskId, progress);
    hideModal('progress-modal');
    render();
  }

  // 添加奖励
  document.getElementById('add-reward-btn').addEventListener('click', function() {
    editingRewardId = null;
    selectedIcon = '🧋';
    document.getElementById('reward-modal-title').textContent = '添加奖励';
    document.getElementById('reward-name-input').value = '';
    document.getElementById('reward-cost-input').value = '';
    document.querySelectorAll('#reward-icon-options .tag-option').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('#reward-icon-options .tag-option[data-icon="🧋"]').classList.add('active');
    showModal('reward-modal');
  });

  // 奖励图标选择
  document.querySelectorAll('#reward-icon-options .tag-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#reward-icon-options .tag-option').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      selectedIcon = this.dataset.icon;
    });
  });

  // 保存奖励
  document.getElementById('reward-save-btn').addEventListener('click', function() {
    var name = document.getElementById('reward-name-input').value.trim();
    var cost = parseInt(document.getElementById('reward-cost-input').value);

    if (!name) { showToast('请输入奖励名称'); return; }
    if (!cost || cost < 1) { showToast('请输入有效积分数'); return; }

    if (editingRewardId) {
      var reward = data.rewards.find(function(r) { return r.id === editingRewardId; });
      if (reward) {
        reward.name = name;
        reward.cost = cost;
        reward.icon = selectedIcon;
      }
    } else {
      data.rewards.push({
        id: 'reward_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: name,
        cost: cost,
        icon: selectedIcon
      });
    }
    saveData();
    hideModal('reward-modal');
    render();
  });

  // 取消奖励
  document.getElementById('reward-cancel-btn').addEventListener('click', function() {
    hideModal('reward-modal');
  });

  // 兑换/编辑/删除奖励（事件委托）
  document.getElementById('reward-list').addEventListener('click', function(e) {
    var exchangeBtn = e.target.closest('.exchange-btn');
    var editBtn = e.target.closest('.edit-reward-btn');
    var deleteBtn = e.target.closest('.delete-reward-btn');

    if (exchangeBtn) {
      var rewardId = exchangeBtn.dataset.rewardId;
      var reward = data.rewards.find(function(r) { return r.id === rewardId; });
      if (reward) {
        showConfirm('确认兑换「' + reward.name + '」？消耗 ' + reward.cost + ' 积分', function() {
          exchangeReward(rewardId);
          render();
        });
      }
    } else if (editBtn) {
      editReward(editBtn.dataset.rewardId);
    } else if (deleteBtn) {
      var rid = deleteBtn.dataset.rewardId;
      showConfirm('确认删除此奖励？', function() {
        data.rewards = data.rewards.filter(function(r) { return r.id !== rid; });
        saveData();
        render();
      });
    }
  });

  // 抽奖
  document.getElementById('lottery-btn').addEventListener('click', function() {
    var btn = this;
    var resultEl = document.getElementById('lottery-result');
    btn.disabled = true;
    btn.classList.add('spinning');
    resultEl.textContent = '';

    setTimeout(function() {
      var points = doLottery();
      btn.classList.remove('spinning');
      resultEl.textContent = '+' + points + ' 分！';
      btn.disabled = data.lotteryChances <= 0;
      render();
    }, 800);
  });

  // 使用双倍卡
  document.getElementById('inventory-grid').addEventListener('click', function(e) {
    var useBtn = e.target.closest('.use-double-card-btn');
    if (useBtn) {
      if (data.doubleCards > 0) {
        data.doubleCards--;
        data.doubleCardActive = Date.now();
        saveData();
        showToast('⚡ 双倍积分卡已激活！24小时有效');
        render();
      }
    }
  });

  // 升级弹窗跳过
  document.getElementById('levelup-skip-btn').addEventListener('click', function() {
    document.getElementById('levelup-overlay').classList.remove('show');
  });

  // 徽章弹窗关闭
  document.getElementById('badge-unlock-close-btn').addEventListener('click', function() {
    document.getElementById('badge-unlock-overlay').classList.remove('show');
  });

  // 长按任务显示操作按钮
  var pressTimer = null;
  document.getElementById('task-list').addEventListener('touchstart', function(e) {
    var taskItem = e.target.closest('.task-item');
    if (!taskItem) return;
    pressTimer = setTimeout(function() {
      taskItem.classList.add('show-actions');
      // 3秒后自动隐藏
      setTimeout(function() {
        taskItem.classList.remove('show-actions');
      }, 3000);
    }, 500);
  });

  document.getElementById('task-list').addEventListener('touchend', function() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  });

  document.getElementById('task-list').addEventListener('touchmove', function() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  });
}

function updateProgressPreview(taskPoints, progress) {
  var multiplier = getTotalMultiplier();
  var actualPoints = Math.round(taskPoints * progress / 100 * multiplier);
  var el = document.getElementById('progress-points-preview');
  if (progress > 0) {
    el.textContent = '可得 ' + actualPoints + ' 分' + (multiplier > 1 ? ' (含倍率×' + multiplier.toFixed(1) + ')' : '');
  } else {
    el.textContent = '可得 0 分';
  }
}

function editTask(taskId) {
  var task = data.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  editingTaskId = taskId;
  selectedTag = task.tag;
  document.getElementById('task-modal-title').textContent = '编辑任务';
  document.getElementById('task-name-input').value = task.name;
  document.getElementById('task-points-input').value = task.points;
  document.getElementById('task-period-select').value = task.period;
  document.querySelectorAll('#tag-options .tag-option').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tag === task.tag);
  });
  showModal('task-modal');
}

function deleteTask(taskId) {
  showConfirm('确认删除此任务？', function() {
    data.tasks = data.tasks.filter(function(t) { return t.id !== taskId; });
    saveData();
    render();
  });
}

function editReward(rewardId) {
  var reward = data.rewards.find(function(r) { return r.id === rewardId; });
  if (!reward) return;
  editingRewardId = rewardId;
  selectedIcon = reward.icon;
  document.getElementById('reward-modal-title').textContent = '编辑奖励';
  document.getElementById('reward-name-input').value = reward.name;
  document.getElementById('reward-cost-input').value = reward.cost;
  document.querySelectorAll('#reward-icon-options .tag-option').forEach(function(b) {
    b.classList.toggle('active', b.dataset.icon === reward.icon);
  });
  showModal('reward-modal');
}

function switchPage(page) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector('.nav-item[data-page="' + page + '"]').classList.add('active');

  if (page === 'stats') {
    // 延迟渲染图表，等待页面可见
    setTimeout(function() {
      renderStatsPage();
    }, 100);
  } else if (page === 'rewards') {
    renderRewardsPage();
  }
}

function showModal(id) {
  document.getElementById(id).classList.add('show');
}

function hideModal(id) {
  document.getElementById(id).classList.remove('show');
}

/* ===== 初始化 ===== */
function init() {
  // 检查断签
  checkStreak();

  // 生成每日挑战
  generateDailyChallenge();

  // 检查每日挑战是否完成
  checkDailyChallenge();

  // 检查自动徽章
  checkAutoBadges();

  // 绑定事件
  bindEvents();

  // 渲染
  render();

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  }
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
