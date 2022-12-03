import React from "react";
import { render } from "react-dom";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  useQuery,
  useMutation,
  gql,
} from "@apollo/client";

// If running locally with a local version of the to-do server,
// change this URL to http://localhost:4000
const serverURL = "http://localhost:4000";

const client = new ApolloClient({
  uri: serverURL,
  cache: new InMemoryCache(),
});

const ADD_TODO = gql`
  mutation AddTodo($type: String!, $description: String!) {
    addTodo(type: $type, description: $description) {
      id
      type
      description
    }
  }
`;

// Component for adding a to-do item
function AddTodo() {
  let descriptionInput;
  let typeInput;
  const [addTodo] = useMutation(ADD_TODO, {
    //
    // Rick: When adding a new object, we have to use update to update the cache.
    // In the case where we are using an optimisticResponse, this is called twice.
    // The first time for the optimistic data and the second time with the real data,
    // from the queries results.
    //
    update(cache, { data: { addTodo } }) {
      console.log(`updating: ${JSON.stringify(addTodo)}`);
      cache.modify({
        fields: {
          todos(existingTodos = []) {
            const newTodoRef = cache.writeFragment({
              data: addTodo,
              fragment: gql`
                fragment NewTodo on Todo {
                  id
                  type
                  description
                }
              `,
            });
            return existingTodos.concat(newTodoRef);
          },
          todosByType(existingTodos = []) {
            if (addTodo.type === "test") {
              const newTodoRef = cache.writeFragment({
                data: addTodo,
                fragment: gql`
                  fragment NewTodo on Todo {
                    id
                    type
                    description
                  }
                `,
              });
              return existingTodos.concat(newTodoRef);
            } else {
              return existingTodos;
            }
          },
        },
      });
    },
  });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTodo({
            variables: {
              type: typeInput.value,
              description: descriptionInput.value,
            },

            // Optimistically add the Todo to the locally cached
            // list before the server responds
            optimisticResponse: {
              addTodo: {
                __typename: "Todo",
                id: "temp-id",
                type: typeInput.value,
                description: descriptionInput.value,
              },
            },
          });
          typeInput.value = "";
          descriptionInput.value = "";
        }}
      >
        <input
          placeholder="type"
          ref={(node) => {
            typeInput = node;
          }}
        />
        <input
          placeholder="description"
          ref={(node) => {
            descriptionInput = node;
          }}
        />
        <button type="submit">Create item</button>
      </form>
    </div>
  );
}

const GET_TODOS = gql`
  {
    todos {
      id
      type
      description
    }
  }
`;

const GET_TODOS_BY_TYPE = gql`
  query todosByType($type: String!) {
    todosByType(type: $type) {
      id
      type
      description
    }
  }
`;

const UPDATE_TODO = gql`
  mutation UpdateTodo($id: String!, $type: String!, $description: String!) {
    updateTodo(id: $id, type: $type, description: $description) {
      id
      type
      description
    }
  }
`;

// Component for displaying the current to-do list
function Todos() {
  const { loading, error, data } = useQuery(GET_TODOS);
  const [updateTodo, { loading: mutationLoading, error: mutationError }] =
    useMutation(UPDATE_TODO);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const todos = data.todos.map(({ id, type, description }) => {
    let descriptionInput;
    let typeInput;
    return (
      <li key={id}>
        <p>
          {id}: {type}: {description}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateTodo({
              variables: {
                id,
                type: typeInput.value,
                description: descriptionInput.value,
              },
            });
            typeInput.value = "";
            descriptionInput.value = "";
          }}
        >
          <input
            placeholder="type"
            ref={(node) => {
              typeInput = node;
            }}
          />
          <input
            placeholder="description"
            ref={(node) => {
              descriptionInput = node;
            }}
          />
          <button type="submit">Update item</button>
        </form>
      </li>
    );
  });

  return (
    <div>
      <ul>{todos}</ul>
      {mutationLoading && <p>Loading...</p>}
      {mutationError && <p>Error: {mutationError.message}</p>}
    </div>
  );
}

function TodosByType() {
  const { loading, error, data } = useQuery(GET_TODOS_BY_TYPE, {
    variables: { type: "test" },
  });
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  console.log(`data: ${JSON.stringify(data)}`);

  const todos = data.todosByType.map(({ id, type, description }) => {
    return (
      <li key={id}>
        <p>
          {id}: {type}: {description}
        </p>
      </li>
    );
  });

  return (
    <div>
      <ul>{todos}</ul>
    </div>
  );
}

function App() {
  return (
    <ApolloProvider client={client}>
      <div>
        <h2>My to-do list</h2>
        <AddTodo />
        <h3>All to-dos aergaergerhg</h3>
        <Todos />
        <h3>to-do by type: test</h3>
        <TodosByType />
      </div>
    </ApolloProvider>
  );
}

render(<App />, document.getElementById("root"));
