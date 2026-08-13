import { redirect } from "next/navigation"

import { tabHref } from "@/features/control-room/types/tabs"

export default function ControlRoomIndexPage(): never {
  redirect(tabHref("overview"))
}
