//----------------------------------------------------------------------
//
// This source file is part of the Folktale project.
//
// See LICENCE for licence information.
// See CONTRIBUTORS for the list of contributors to the project.
//
//----------------------------------------------------------------------

// This tool converts special Markdown files to the JS files that
// provide documentation information for Meta:Magical. This allows
// documentation to stay out of source files, and also allows us to
// support translating documentation to other languages.
const yaml = require('js-yaml');
const marked = require('marked');
const template = require('babel-template');
const parseJs = require('babylon').parse;
const t = require('babel-types');
const generateJs = require('babel-generator').default;
const fs = require('fs');
const path = require('path');

const babelOptions = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/source/.babelrc'), 'utf8'));


// --[ Helpers ]-------------------------------------------------------
const match = ([tag, payload], pattern) => pattern[tag](payload);

const append = (list, item) =>
  item != null ? [...list, item]
: /* _ */        list;

const parseJsExpr = (source) => {
  const ast = parseJs(source);
  t.assertExpressionStatement(ast.program.body[0]);
  return ast.program.body[0].expression;
};

const pairs = (object) =>
  Object.keys(object).map(key => [key, object[key]]);

const merge = (...args) => {
  return Object.assign({}, ...args);
};

const raise = (error) => {
  throw error;
};

const isString = (value) => typeof value === 'string';

const isBoolean = (value) => typeof value === 'boolean';

const isNumber = (value) => typeof value === 'number';

const isObject = (value) => Object(value) === value;


function metamagical_withMeta(object, meta) {
  const parent  = Object.getPrototypeOf(object);
  let oldMeta   = object[Symbol.for('@@meta:magical')] || {};
  if (parent && parent[Symbol.for('@@meta:magical')] === oldMeta) {
    oldMeta = {};
  }

  Object.keys(meta).forEach(function(key) {
    if (/^~/.test(key)) {
      oldMeta[key.slice(1)] = meta[key];
    } else {
      oldMeta[key] = meta[key];
    }
  });
  object[Symbol.for('@@meta:magical')] = oldMeta;

  return object;
}

const withMeta = template(
  `__metamagical_withMeta(OBJECT, META)`
);

const withMetaFD = parseJs(metamagical_withMeta.toString()).program.body[0];
const withMetaAST = t.functionExpression(
  t.identifier('metamagical_withMeta'),
  withMetaFD.params,
  withMetaFD.body
);

// --[ Parser ]--------------------------------------------------------
const classifyLine = (line) =>
  /^\@annotate:/.test(line) ? ['Entity', line.match(/^\@annotate:\s*(.+)/m)[1]]
: /^---+\s*$/.test(line)    ? ['Separator']
: /* otherwise */             ['Line', line];


const parse = (source) =>
  append(source.split(/\r\n|\n\r|\r|\n/).map(classifyLine), ['EOF'])
    .reduce((ctx, node, i) => match(node, {
      Entity(ref) {
        return {
          annotation: true,
          current: { ref, meta: '', doc: '' },
          ast: append(ctx.ast, ctx.current)
        };
      },

      Separator() {
        if (!ctx.current) {
          throw new Error(`Annotation separator found without a matching entity at line ${i + 1}`);
        }
        return {
          annotation: false,
          current: ctx.current,
          ast: ctx.ast
        };
      },

      EOF() {
        return {
          annotation: false,
          current: null,
          ast: append(ctx.ast, ctx.current)
        };
      },

      Line(line) {
        if (!ctx.current) {
          throw new Error(`Documentation found before an entity annotation at line ${i + 1}`);
        }
        if (ctx.annotation) {
          const { ref, meta, doc } = ctx.current;
          return {
            annotation: true,
            current: { ref, meta: meta + '\n' + line, doc },
            ast: ctx.ast
          };
        } else {
          const { ref, meta, doc } = ctx.current;
          return {
            annotation: false,
            current: { ref, meta, doc: doc + '\n' + line },
            ast: ctx.ast
          };
        }
      }
    }), { 
      current: null, 
      annotation: false, 
      ast: [] 
    }).ast;


// --[ Compiler transformations ]--------------------------------------
const analyse = (entities) =>
  entities.map(parseMeta);

const parseMeta = (entity) => {
  let meta = yaml.safeLoad(entity.meta) || {};
  meta.documentation = entity.doc;
  return {
    ref: entity.ref,
    meta
  };
};


class Raw {
  constructor(value) {
    this.value = value;
  }
}

// Examples
const intoExampleFunction = (source, ast, options) => {
  const body = ast.program.body;

  return new Raw(withMeta({
    OBJECT: t.functionExpression(
      null,   // id
      [],     // params
      t.blockStatement(body),
      false,  // generator
      false   // async
    ),
    META: mergeMeta(options, { source })
  }).expression);
};

const makeParser = (options) => (source) => parseJs(source, options || {});

const parseExample = ({ name, source }, options) => {
  let parse = makeParser(options || {})
  return name        ? { name, call: intoExampleFunction(source, parse(source), options), inferred: true }
  :      /* else */    { name: '', call: intoExampleFunction(source, parse(source), options), inferred: true };
};


const isExampleLeadingParagraph = (node) =>
   node
&& (node.type === 'paragraph' || node.type === 'heading')
&& /::\s*$/.test(node.text);


const collectExamples = (documentation) => {
  const ast = marked.lexer(documentation);

  const [xs, x, name] = ast.reduce(([examples, current, heading, nextNodeIsExample], node) => {
    if (node.type === 'code') {
      if (nextNodeIsExample) {
        return [examples, [...current, node.text], heading, false];
      } else {
        return [examples, current, heading, false];
      }
    } else if (node.type === 'heading') {
      return [
        examples.concat({
          name: heading,
          source: current.join('\n\n')
        }),
        [],
        node.text,
        isExampleLeadingParagraph(node)
      ];
    } else if (node.type === 'paragraph') {
      return [examples, current, heading, isExampleLeadingParagraph(node)];
    } else {
      return [examples, current, heading, false];
    }
  }, [[], [], null, false]);

  if (x.length === 0) {
    return xs;
  } else {
    return [...xs, {
      name: name,
      source: x.join('\n;\n')
    }];
  }
};

const inferExamples = (documentation, options) => {
  const examples = collectExamples(documentation || '');

  return examples.length > 0?  { examples: examples.map(e => parseExample(e, options)) }
  :      /* otherwise */       { };
};

const inferDeprecated = (meta) => {
  return meta.deprecated ?  merge(meta, { stability: 'deprecated' })
  :      /* otherwise */    meta;
};

const inferMetadataFromProvidedMetadata = (meta) => {
  return inferDeprecated(meta);
};

const mergeMeta = (options, ...args) => {
  let fullMeta = merge(...args);
  fullMeta = inferMetadataFromProvidedMetadata(fullMeta);

  if (fullMeta.documentation) {
    const doc = fullMeta.documentation;
    fullMeta = merge(fullMeta, inferExamples(doc, options));
    fullMeta.documentation = doc.replace(/^::$/gm, '').replace(/::[ \t]*$/gm, ':');
  }

  return objectToExpression(fullMeta);
};


// --[ Code generation ]-----------------------------------------------
const annotateEntity = template(
  `meta.for(ENTITY).update(OBJECT)`
);


const lazy = (expr) => 
  t.functionExpression(
    null,
    [],
    t.blockStatement([
      t.returnStatement(expr)
    ])
  );

const specialParsers = {
  '~belongsTo'(value) {
    const ast = parse(value);
    t.assertExpressionStatement(ast.program.body[0]);

    return lazy(ast.program.body[0].expression);
  }
};

const parseSpecialProperty = (value, key) =>
  specialParsers[key](value);

const isSpecial = (value, key) => key && key in specialParsers;

const objectToExpression = (object) =>
  t.objectExpression(
    pairs(object).map(pairToProperty)
  );

const pairToProperty = ([key, value]) =>
  t.objectProperty(
    t.stringLiteral(key),
    valueToLiteral(value, key)
  );

const valueToLiteral = (value, key) =>
  value instanceof Raw  ?  value.value
: Array.isArray(value)  ?  t.arrayExpression(value.map(x => valueToLiteral(x)))
: isSpecial(value, key) ?  parseSpecialProperty(value, key)
: isString(value)       ?  t.stringLiteral(value)
: isBoolean(value)      ?  t.booleanLiteral(value)
: isNumber(value)       ?  t.numericLiteral(value)
: isObject(value)       ?  objectToExpression(value)
: /* otherwise */          raise(new TypeError(`Type of property not supported: ${value}`));


const generate = (entities, options) =>
  generateJs(
    t.program(
      entities.map(x => generateEntity(x, options))
    )
  ).code;

const generateEntity = (entity, options) =>
  annotateEntity({
    ENTITY: parseJsExpr(entity.ref),
    OBJECT: mergeMeta(options, entity.meta)
  });


// --[ Main ]----------------------------------------------------------
if (process.argv.length < 3) {
  throw new Error('Usage: node markdown-to-mm.js <INPUT>');
}
const input = process.argv[2];
const source = fs.readFileSync(input, 'utf8');
console.log(generate(analyse(parse(source)), babelOptions));
