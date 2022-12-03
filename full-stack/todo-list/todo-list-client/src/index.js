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
      onError: (error) => {
        console.log("error", error);
      },
      //
      // When adding a *new* object, we have to use the "update" callback to update the cache.
      // The optimistic response adds the new item into the optimistic cache, but the front end
      // has no way to unambiguously know what cached queries to update with the new item. None of the
      // existing queries have the new entitiy's id associated with them and no assumtions are made as to which
      // queries the new item should be associated with. So we have to add the new entity
      // appropriately with the update callback.
      //
      // In the case, such as here, where we are using the optimisticResponse, this update method is called twice.
      // The first time with the optimistic data (with the tmp id) and the second time with the real data,
      // from the query's mutation results. So, it's important that an optimistic mutation returns the
      // new entity as part of it's mutation results.
      //
      // If the mutation fails, I think this will only be called once??
      //
      update(cache, { data: { addTodo } }) {
        console.log(`updating: ${JSON.stringify(addTodo)}`);

        cache.modify({
          fields: {
            //
            // This field holds the caches list of to-do items. This is a root query and can be updated
            // easily with cache.modify.
            //
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
            // Here we have a root attribute based on a query to todosByType(type: string),
            // The cache key is actually a string like todosByType({\"type\":\"foo\"}).
            // For different "type" values, we have a different cache key and associated lists of cached values.
            // Since we call todosByType with type:foo and again with type:bar we will actaully have 2 cached lists;
            // one with cache key todosByType({\"type\":\"foo\"}) and the other with cache key todosByType({\"type\":\"bar\"})
            // So, how does this work. Well, this field function is actually called once for each permutation
            // of cache key based on the value of "type". Since our code queries for "foo" and "bar"
            // and both of those queries have previously cached their results, this function is called twice, once with
            // options.storeFieldName === "todosByType({\"type\":\"foo\"})" and again with
            // options.storeFieldName === "todosByType({\"type\":\"bar\"})"
            //
            // It's unfortunate, but the only indicator of "type" for both calls is the string options.storeFieldName.
            // There is a lot of discusstion around this as it leads to some kinda hacky code
            // in the cache.update code as you will see. It is often important to know the key values as those
            // are the variables for our query and often have an impact on what values to put in what cached query.
            //
            // Here is more discussion: https://github.com/apollographql/apollo-client/issues/7129
            //
            // For something simple we can just compare options.storeFieldName with our newly added item, as we do below.
            // To get a bit fancier, we could write code to parse the options.storeFieldName field. That might llok like:
            //
            // const args = JSON.parse(options.storeFieldName.replace(`${options.fieldName}:`, ''))
            //
            // There is some stability risk here as Apollo could decide to change the format of options.storeFieldName
            // in the future. For now, however, it's all we got.
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
            // add a Todo entity with cache key "Todo:temp-id" to the cache.
            // No existing queries will pick that up because no existing queries already contain
            // the new cache key "Todo:temp-id". We have the "update" function
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

// Component for displaying the current Todo list
function Todos() {
  const { loading, error, data } = useQuery(GET_TODOS);

  //
  // Notice the difference with add vs update. Here, in update, we do not
  // need to update the cache. The mutation call to updateTodo uses the
  // optimisticResponse attribute which updates the optimistic cache item
  // for the given id. Since the queries (todos, todosByType) already contain (a reference to)
  // those object ids, where appropriate, we do not need to use the update callback to update the cache.
  // It's easy for Apollo to unambiguously infer which queries are updated.
  //
  const [updateTodo, { loading: mutationLoading, error: mutationError }] =
    useMutation(UPDATE_TODO, {
      onError: (error) => {
        console.log("error", error);
      },
    });

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
        Add items to the to-do list. Type is an arbitrary string. If set to foo
        or bar, the item will show up in the respectful list below. Submitting
        with type set to "fail" will make the back end throw an exception so you
        can see the optimistic rollback in the UI. The server has some
        artificial delay built in to showcase the effects of optimistic caching.
        <AddTodo />
        <h3>All to-dos</h3>
        <Todos />
        <h3>to-do items with type: foo</h3>
        <TodosByType type="foo" />
        <h3>to-do items with type: bar</h3>
        <TodosByType type="bar" />
      </div>
    </ApolloProvider>
  );
}

render(<App />, document.getElementById("root"));
