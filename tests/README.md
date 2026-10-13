# 测试入口

```bash
npm test
python -m pytest server/tests -q
python scripts/test-http-integration.py
```

Node 内置 test runner 测试无 UI 依赖的领域层、备份和同步引擎。
Python 测试使用 FastAPI TestClient + 临时 SQLite，不访问外部服务。
`tests/fixtures/demo.json` 是固定的虚构跨语言契约样例，不是用户真实数据。
`tests/fixtures/validation-cases.json` 的32条正反用例由JS与Python共享执行。HTTP启动器使用临时数据库/随机测试令牌，覆盖丢失确认、冲突、删除与大批次；两端客户端仍使用MemoryDriver，不能替代真实设备测试。
重新生成样例：先编译 core，然后运行 `node scripts/export-fixtures.mjs`。
UI 完整类型检查：`npm run check`；生产 Web 构建：`npm run build`。
原生壳、移动端、Docker 和真实设备测试是独立验收项，不由以上单元测试替代。
