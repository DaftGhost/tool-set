const functionNames = [
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'EXTRACT',
  'SUBSTRING', 'SUBSTR', 'TRIM', 'LTRIM', 'RTRIM', 'LOWER', 'UPPER', 'LENGTH', 'CHAR_LENGTH',
  'CHARACTER_LENGTH', 'ABS', 'ROUND', 'FLOOR', 'CEIL', 'CEILING', 'CONCAT', 'CONCAT_WS',
  'GROUP_CONCAT', 'STRING_AGG', 'REPLACE', 'IFNULL', 'NVL', 'ISNULL', 'IIF', 'NOW', 'GREATEST',
  'LEAST', 'RANK', 'ROW_NUMBER', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  'DATE_TRUNC', 'DATEDIFF', 'DATE_FORMAT', 'JSON_EXTRACT', 'JSON_UNQUOTE', 'ANY_VALUE',
  'ARRAY_AGG', 'BOOL_AND', 'BOOL_OR', 'UNNEST', 'GENERATE_SERIES', 'SUBSTRING_INDEX',
  'POSITION', 'STRPOS', 'SPLIT_PART', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
  'DATE', 'IF', 'LEFT', 'RIGHT',
]

const keywordNames = [
  ...functionNames,
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'ILIKE', 'BETWEEN',
  'EXISTS', 'AS', 'ON', 'JOIN', 'INNER', 'OUTER', 'FULL', 'CROSS', 'NATURAL', 'GROUP', 'BY',
  'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'WITH',
  'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'TRUE', 'FALSE', 'PRIMARY',
  'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CASCADE', 'RESTRICT', 'BEGIN',
  'COMMIT', 'ROLLBACK', 'TRANSACTION', 'IGNORE', 'USING', 'RETURNING', 'WINDOW', 'PARTITION',
  'OVER', 'FETCH', 'NEXT', 'ONLY', 'ROWS', 'INTERSECT', 'EXCEPT', 'EXPLAIN', 'ANALYZE', 'GRANT',
  'REVOKE', 'TRUNCATE', 'COMMENT', 'SHOW', 'DESCRIBE', 'USE', 'DATABASE', 'SCHEMA', 'PROCEDURE',
  'FUNCTION', 'TRIGGER', 'DECLARE', 'CALL', 'EXEC', 'EXECUTE', 'MERGE', 'MATCHED', 'TOP',
  'LATERAL', 'COLLATE', 'ESCAPE', 'CHECK', 'UNIQUE', 'ADD', 'COLUMN', 'MODIFY', 'RENAME', 'TO',
  'OF', 'FOR', 'START', 'SAVEPOINT', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'NUMERIC',
  'DECIMAL', 'FLOAT', 'REAL', 'DOUBLE', 'PRECISION', 'BOOLEAN', 'BOOL', 'TEXT', 'VARCHAR', 'CHAR',
  'CHARACTER', 'VARYING', 'TIME', 'TIMESTAMP', 'INTERVAL', 'SERIAL', 'JSON', 'JSONB', 'UUID',
  'BLOB', 'NVARCHAR', 'AUTO_INCREMENT', 'CONFLICT', 'NOTHING', 'NULLS', 'FIRST', 'LAST', 'UNKNOWN',
  'TEMP', 'TEMPORARY', 'IF', 'EXISTS', 'QUALIFY', 'FILTER', 'WITHIN', 'CUBE', 'ROLLUP', 'UNBOUNDED',
  'PRECEDING', 'FOLLOWING', 'CURRENT', 'EXCLUDE', 'GROUPS', 'SEPARATOR', 'IDENTITY', 'GENERATED',
  'ALWAYS', 'STORED', 'VIRTUAL', 'REFERENCES',
]

const phraseList = [
  ['LEFT', 'OUTER', 'JOIN'],
  ['RIGHT', 'OUTER', 'JOIN'],
  ['FULL', 'OUTER', 'JOIN'],
  ['INNER', 'JOIN'],
  ['LEFT', 'JOIN'],
  ['RIGHT', 'JOIN'],
  ['FULL', 'JOIN'],
  ['CROSS', 'JOIN'],
  ['NATURAL', 'JOIN'],
  ['UNION', 'ALL'],
  ['GROUP', 'BY'],
  ['ORDER', 'BY'],
  ['PARTITION', 'BY'],
  ['INSERT', 'INTO'],
  ['DELETE', 'FROM'],
  ['REPLACE', 'INTO'],
  ['CREATE', 'TABLE'],
  ['CREATE', 'INDEX'],
  ['ALTER', 'TABLE'],
  ['DROP', 'TABLE'],
  ['PRIMARY', 'KEY'],
  ['FOREIGN', 'KEY'],
  ['NOT', 'NULL'],
  ['NOT', 'EXISTS'],
  ['NOT', 'IN'],
  ['NOT', 'LIKE'],
  ['IS', 'NOT'],
  ['IS', 'NULL'],
  ['ON', 'DELETE'],
  ['ON', 'UPDATE'],
  ['ON', 'CONFLICT'],
  ['SELECT', 'DISTINCT'],
  ['WITH', 'RECURSIVE'],
  ['FETCH', 'FIRST'],
  ['FETCH', 'NEXT'],
]

export class SqlLexicon {
  static readonly functions = new Set(functionNames)
  static readonly keywords = new Set(keywordNames)
  static readonly phrases = [...phraseList].sort((left, right) => right.length - left.length)
  static readonly clauses = new Set([
    'SELECT', 'SELECT DISTINCT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
    'OFFSET', 'FETCH', 'FETCH FIRST', 'FETCH NEXT', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
    'SET', 'RETURNING', 'WINDOW', 'VALUES', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
    'FULL JOIN', 'CROSS JOIN', 'NATURAL JOIN', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  ])
  static readonly inlineHeads = new Set([
    'INSERT INTO', 'REPLACE INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'CREATE INDEX',
    'ALTER TABLE', 'DROP TABLE', 'WITH', 'WITH RECURSIVE',
  ])
  static readonly bodyLists = new Set(['SELECT', 'SELECT DISTINCT', 'FROM', 'GROUP BY', 'ORDER BY', 'SET'])
  static readonly statementStarts = new Set([
    'WITH', 'SELECT', 'INSERT', 'REPLACE', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP',
    'TRUNCATE', 'EXPLAIN', 'DESCRIBE', 'DESC', 'SHOW', 'GRANT', 'REVOKE', 'BEGIN', 'COMMIT',
    'ROLLBACK', 'SAVEPOINT', 'SET', 'USE', 'CALL', 'EXEC', 'EXECUTE', 'DECLARE', 'VALUES', 'START',
  ])
  static readonly operators = ['<>', '!=', '<=', '>=', '||', '::', '->>', '->', '=>', ':=', '+', '-', '*', '/', '%', '=', '<', '>', '|', '&']
}
