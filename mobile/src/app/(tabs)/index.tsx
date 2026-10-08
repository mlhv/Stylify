import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { getAllItemsQueryOptions, type Item } from "@/lib/api";

function ItemCard({ item }: { item: Item }) {
  return (
    <View className="w-1/2">
      <Link href={{ pathname: "/item/[id]", params: { id: item.id } }} asChild>
        <Pressable
          className="m-1.5"
          accessibilityLabel={`Edit ${item.name ?? "item"}`}
        >
          <Image
            source={{ uri: item.imageUrl }}
            style={{
              width: "100%",
              aspectRatio: 1,
              borderRadius: 12,
              backgroundColor: "#e5e5e5",
            }}
            contentFit="cover"
          />
          <Text className="mt-1 font-medium" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-sm text-neutral-500" numberOfLines={1}>
            {[item.type, item.size, item.color].filter(Boolean).join(" · ")}
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

function Skeletons() {
  return (
    <View className="flex-row flex-wrap p-1.5">
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} className="w-1/2 p-1.5">
          <View className="aspect-square w-full rounded-xl bg-neutral-200" />
          <View className="mt-2 h-4 w-2/3 rounded bg-neutral-200" />
        </View>
      ))}
    </View>
  );
}

export default function Wardrobe() {
  const { data, error, isPending, isRefetching, refetch } = useQuery(
    getAllItemsQueryOptions,
  );

  if (isPending) return <Skeletons />;
  if (error && !data)
    return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <FlatList
      className="flex-1 bg-white"
      contentContainerClassName="p-1.5"
      data={data.items}
      keyExtractor={(item) => item.id.toString()}
      numColumns={2}
      renderItem={({ item }) => <ItemCard item={item} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      }
      ListEmptyComponent={
        <View className="items-center gap-2 p-10">
          <Text className="text-lg font-semibold">Your wardrobe is empty</Text>
          <Text className="text-center text-neutral-500">
            Use the Add tab to photograph your first item.
          </Text>
        </View>
      }
    />
  );
}
