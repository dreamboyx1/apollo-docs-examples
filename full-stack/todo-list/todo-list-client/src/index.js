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
  const [addTodo, { loading: mutationLoading, error: mutationError }] =
    useMutation(ADD_TODO, {
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
            //
            // Rick: Here we have a root attribute based on a query to todosByType(type: string),
            // The cache key is actually the string todosByType({\"type\":\"test\"}).
            // For different type values, we have different lists of cached values.
            // But, here we just have options.storeFieldName === todosByType({\"type\":\"test\"}).
            // So, how does this work. Well, this field function is actually called
            // for each permutation of options.storeFieldName.
            //
            // Here is more discussion: https://github.com/apollographql/apollo-client/issues/7129
            //
            // If we want to target the specific field args, it gets pretty hacky.
            // One way is to parse storeFieldName. Of for something simple we can just compare.
            // But then what if the format of storeFieldName changes in the future?
            //
            todosByType(existingTodos = [], options) {
              console.log(`options: ${JSON.stringify(options)}`);
              if (
                options.storeFieldName ===
                `todosByType({\"type\":\"${addTodo.type}\"})`
              ) {
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
            // list before the server responds. This will only
            // add a TODO with cache key "Todo:temp-id". No existing queries
            // will pick that up because no existing queries already contain
            // the cache key "Todo:temp-id". We have the update function
            // in the addTodo mutation to do the work of updating the
            // existing queries with the new data.
            //
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
      <div>
        {mutationLoading && <p>Loading...</p>}
        {mutationError && <p>Error: {mutationError.message}</p>}
      </div>
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
              // Optimistically add the Todo to the locally cached
              // list before the server responds

              optimisticResponse: {
                updateTodo: {
                  __typename: "Todo",
                  id,
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

function TodosByType(props) {
  console.log(`TodosByType: props: ${JSON.stringify(props)}`);
  const { loading, error, data } = useQuery(GET_TODOS_BY_TYPE, {
    variables: { type: props.type ?? "test" },
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
        <h3>to-do by type: foo</h3>
        <TodosByType type="foo" />
        <h3>to-do by type: bar</h3>
        <TodosByType type="bar" />
      </div>
    </ApolloProvider>
  );
}

render(<App />, document.getElementById("root"));
