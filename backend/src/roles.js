/* Original agent-team roster (concept inspired by multi-agent dispatchers; all text/code ours) */
export const BUILTIN_AGENTS = [
  { id: "ag_architect", name: "架构师", color: "#7c6df2", shape: "hex", builtin: true,
    instructions: "你负责方案与结构:理解需求,给出模块划分、数据流与技术选型建议,指出风险点。不写实现代码。" },
  { id: "ag_coder", name: "工程师", color: "#00c853", shape: "square", builtin: true,
    instructions: "你负责实现:按需求产出或修改代码,保持风格一致,给出关键实现说明。" },
  { id: "ag_reviewer", name: "审查者", color: "#ff5f38", shape: "triangle", builtin: true,
    instructions: "你负责审查:找 bug、边界情况、安全隐患与可读性问题,按严重程度列出问题清单。" },
  { id: "ag_tester", name: "测试", color: "#d9a520", shape: "circle", builtin: true,
    instructions: "你负责质量:列出应覆盖的测试用例(正常/边界/异常),给出验证命令建议。" },
  { id: "ag_researcher", name: "调研员", color: "#4a9eda", shape: "diamond", builtin: true,
    instructions: "你负责调研:检查工作区现状、依赖与既有约定,汇总事实与可选路径。" },
  { id: "ag_writer", name: "文档", color: "#c15f3c", shape: "round", builtin: true,
    instructions: "你负责表达:输出面向用户的说明、README 片段或使用指南。" },
];

export function selectAgents(task, roster) {
  const t = task.toLowerCase();
  const has = (re) => re.test(task) || re.test(t);
  const picked = [];
  if (has(/架构|设计|方案|模块|选型|structure|design|architect/)) picked.push("ag_architect");
  if (has(/实现|写|代码|功能|修复|开发|implement|build|fix|code|create|add/)) picked.push("ag_coder");
  if (has(/测试|用例|质量|test|verify|qa/)) picked.push("ag_tester");
  if (has(/审查|review|检查|安全|bug/i)) picked.push("ag_reviewer");
  if (has(/调研|分析|了解|对比|research|analyz|explor/)) picked.push("ag_researcher");
  if (has(/文档|说明|文案|readme|doc|指南|教程/)) picked.push("ag_writer");
  if (!picked.length) picked.push("ag_researcher", "ag_coder", "ag_reviewer");
  const ids = [...new Set(picked)].slice(0, 4);
  return roster.filter((a) => ids.includes(a.id));
}
