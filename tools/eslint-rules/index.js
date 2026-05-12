/**
 * Gravel Phase-1 custom ESLint rules.
 *
 *  - no-float-money            : bans `number` type annotation on properties/
 *                                parameters whose name ends with `_minor`,
 *                                `Amount`, or that are typed `MoneyAmount`.
 *                                Money MUST be bigint (FND-07, ADR-0003).
 *
 *  - no-raw-created-at-date    : forbids `created_at::date` substring in
 *                                files under `src/**\/reports/`. Reports must
 *                                aggregate by `operational_day` (ADR-0003).
 *
 * Registered in eslint config via `plugins: { gravel: require('./tools/eslint-rules') }`.
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
const noFloatMoney = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Money fields must be bigint minor units — `number` type is banned (FND-07, ADR-0003).',
    },
    schema: [],
    messages: {
      banned:
        'Money field "{{name}}" is typed `number` — use bigint minor units (FND-07, ADR-0003).',
    },
  },
  create(context) {
    function isMoneyName(name) {
      if (typeof name !== 'string') return false;
      return (
        name.endsWith('_minor') ||
        name.endsWith('Minor') ||
        /Amount$/.test(name) ||
        /Price$/.test(name) ||
        /Cost$/.test(name)
      );
    }
    function annotationIsNumber(annotation) {
      if (!annotation || !annotation.typeAnnotation) return false;
      const t = annotation.typeAnnotation;
      return t.type === 'TSNumberKeyword';
    }
    function annotationIsMoneyAmount(annotation) {
      if (!annotation || !annotation.typeAnnotation) return false;
      const t = annotation.typeAnnotation;
      return (
        t.type === 'TSTypeReference' &&
        t.typeName &&
        t.typeName.type === 'Identifier' &&
        t.typeName.name === 'MoneyAmount'
      );
    }
    return {
      PropertyDefinition(node) {
        const name =
          node.key && node.key.type === 'Identifier' ? node.key.name : null;
        if (isMoneyName(name) && annotationIsNumber(node.typeAnnotation)) {
          context.report({ node, messageId: 'banned', data: { name } });
        }
        if (
          annotationIsMoneyAmount(node.typeAnnotation) &&
          annotationIsNumber(node.typeAnnotation)
        ) {
          context.report({ node, messageId: 'banned', data: { name } });
        }
      },
      TSPropertySignature(node) {
        const name =
          node.key && node.key.type === 'Identifier' ? node.key.name : null;
        if (isMoneyName(name) && annotationIsNumber(node.typeAnnotation)) {
          context.report({ node, messageId: 'banned', data: { name } });
        }
      },
      Identifier(node) {
        // Function parameter:  fn(amount: number)
        if (
          node.parent &&
          (node.parent.type === 'FunctionDeclaration' ||
            node.parent.type === 'FunctionExpression' ||
            node.parent.type === 'ArrowFunctionExpression') &&
          isMoneyName(node.name) &&
          annotationIsNumber(node.typeAnnotation)
        ) {
          context.report({
            node,
            messageId: 'banned',
            data: { name: node.name },
          });
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noRawCreatedAtDate = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid `created_at::date` in reports — aggregate by operational_day instead (ADR-0003).',
    },
    schema: [],
    messages: {
      banned:
        '`created_at::date` is banned in reports — use operational_day (ADR-0003).',
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, '/');
    // Only enforce in report code paths.
    if (!/\/src\/.*\/reports\//.test(filename)) return {};
    return {
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          node.value.indexOf('created_at::date') !== -1
        ) {
          context.report({ node, messageId: 'banned' });
        }
      },
      TemplateElement(node) {
        if (
          node.value &&
          typeof node.value.raw === 'string' &&
          node.value.raw.indexOf('created_at::date') !== -1
        ) {
          context.report({ node, messageId: 'banned' });
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'no-float-money': noFloatMoney,
    'no-raw-created-at-date': noRawCreatedAtDate,
  },
};
