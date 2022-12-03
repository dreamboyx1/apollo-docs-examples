const { ApolloServer, gql } = require("apollo-server");
const LRU = require("lru-cache");
const { generate } = require("shortid");

async function sleep(time, cb) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(cb?.()), time);
  });
}

// Schema definition
const typeDefs = `
  type Query {
    todos: [Todo]
		todo(id: String!): Todo
    todosByType(type: String!): [Todo]
  }

	type Todo {
		id: String!
    type: String!
		description: String!
	}

	type Mutation {
		addTodo(type: String!, description: String!): Todo
		updateTodo(id: String!, type: String!, description: String!): Todo
	}
`;

// LRU cache for storing to-do items
const cache = LRU({ max: 25, maxAge: 1000 * 60 * 5 });

// Resolver definitions
const resolvers = {
  Query: {
    todos: () => {
      const todos = [];
      cache.forEach((entry) => todos.push(entry));
      return todos;
    },
    todosByType: (_, { type }) => {
      const todos = [];
      cache.forEach((entry) => {
        if (type === entry.type) todos.push(entry);
      });
      return todos;
    },
    todo: (_, { id }) => {
      return cache.get(id);
    },
  },
  Mutation: {
    addTodo: async (_, { type, description }) => {
      await sleep(5000);
      if (type === "fail") {
        throw new Error("failed on type === fail");
      }
      const id = generate();
      const todo = { id, type, description };
      cache.set(id, todo);
      return todo;
    },
    updateTodo: async (_, { id, type, description }) => {
      await sleep(5000);
      if (type === "fail") {
        throw new Error("failed on type === fail");
      }
      const todo = { id, type, description };
      cache.set(id, todo);
      return todo;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
